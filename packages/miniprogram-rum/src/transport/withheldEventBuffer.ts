import type { SessionManager } from '@flashcatcloud/miniprogram-core'
import { isWithholdingEvents, jsonStringify } from '@flashcatcloud/miniprogram-core'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { RumEvent } from '../rumEvent.types'

/** How much history a withheld buffer may span: an error session shows the minute before its error. */
export const WITHHELD_BUFFER_DURATION = 60 * 1000

/** Memory bound. Above it the least valuable events are dropped first, see {@link EvictionTier}. */
export const WITHHELD_BUFFER_BYTES_LIMIT = 64 * 1024
export const WITHHELD_BUFFER_EVENTS_LIMIT = 200

/**
 * A view is the container its events hang from: the backend builds the session out of view events,
 * so a detail released without its view would be unreachable. Views are kept out of the eviction
 * budget for that reason, and this only bounds pathological page counts.
 */
export const WITHHELD_BUFFER_VIEWS_LIMIT = 50

/**
 * Correlated errors make every client release at the same instant, right when whatever caused them
 * is already under strain. Releases are spread over this window instead.
 */
export const WITHHELD_BUFFER_RELEASE_MAX_DELAY = 3 * 1000

/** What gets dropped first when the buffer is over budget. Lower goes first. */
const enum EvictionTier {
  /** Requests that succeeded without complaint. */
  FIRST,
  /** Actions, failed requests and everything else: they explain what the user was doing. */
  LAST,
  /**
   * Errors are the reason the session is kept at all, so they go only once nothing else is left -
   * and even then the newest goes first, because the earliest error is the one that releases the
   * buffer and the one the session is about.
   */
  LAST_RESORT,
}

/**
 * Held serialized, which is how the batch would have taken the event: what the host or the SDK
 * mutates afterwards through a reference the event shares does not reach a release, and the bytes
 * accounted for are the bytes that will leave.
 */
interface WithheldEvent {
  serialized: string
  viewId: string
  time: number
  bytes: number
  tier: EvictionTier
  isError: boolean
}

interface WithheldView {
  serialized: string
  date: number
}

export interface WithheldEventBuffer {
  /**
   * The app is going to the background. A release still waiting on its jitter is sent now, while
   * the app may still send; an unreleased buffer is kept, since the app usually comes back.
   */
  flushOnAppHide: () => void
  stop: () => void
}

/**
 * Holds the events of a session that withholds them until it reports an error, and forwards
 * everything else straight away. A session that never errors uploads nothing at all.
 */
export function startWithheldEventBuffer(
  lifeCycle: LifeCycle,
  sessionManager: SessionManager,
  forward: (event: RumEvent) => void,
  debug = false,
): WithheldEventBuffer {
  /** Latest event per view, in the order they were last updated. */
  let views = new Map<string, WithheldView>()
  let details: WithheldEvent[] = []
  let bytes = 0
  let currentViewId: string | undefined
  let currentViewDate = -Infinity
  let withheldForSessionId: string | undefined
  let releaseTimer: ReturnType<typeof setTimeout> | undefined
  /** When the release was scheduled, which is what freezes the window - see {@link prune}. */
  let releaseScheduledAt: number | undefined
  let droppedCount = 0

  const eventSubscription = lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => {
    const session = sessionManager.findTrackedSession()
    // Which session an event belongs to is what the event says, not whichever session is current:
    // assembly resolves the session at the event's own time, so a request completing after its
    // session ended still carries that session's id.
    const eventSessionId: string | undefined = event.session?.id
    const isFrom = (sessionId: string | undefined) => eventSessionId === undefined || eventSessionId === sessionId

    if (withheldForSessionId !== undefined && session?.id !== withheldForSessionId) {
      // The withholding session is gone. A renewal settles the buffer before any event of the new
      // session is assembled; this catches an expiry or a stop that no renewal has followed yet.
      const wasWithheldFor = withheldForSessionId
      const wasReleased = releaseTimer !== undefined
      settleBuffer(true)
      if (!wasReleased && isFrom(wasWithheldFor)) {
        // A straggler of the session just thrown away, caught here because the history may no
        // longer answer for it: an event dated at the very instant the session ended falls outside
        // the span the history keeps for it.
        return
      }
    }

    if (eventSessionId !== undefined && session?.id !== eventSessionId) {
      // A straggler: its session ended before it was assembled. It goes the way that session went,
      // read off the session itself rather than off what this buffer held for it - a session can
      // end before any of its events reached the buffer. One that never reported an error uploads
      // nothing; letting a straggler through would store the very session the withholding avoided.
      const eventSession = sessionManager.findSession(event.date)
      if (eventSession?.id === eventSessionId && isWithholdingEvents(eventSession)) {
        return
      }
    }

    if (session && isWithholdingEvents(session) && isFrom(session.id)) {
      withheldForSessionId = session.id
      hold(event)
      return
    }

    if (withheldForSessionId !== undefined && isFrom(withheldForSessionId)) {
      if (event.type === 'error' && sizeOf(event) > WITHHELD_BUFFER_BYTES_LIMIT) {
        // The session has already earned its release. An error larger than the whole budget goes
        // to the batch on its own, without evicting the history before it; that history still
        // leaves behind the jitter.
        forward(event)
        scheduleRelease()
        return
      }
      // Whatever is still held belongs to a session that has just been released. This event,
      // typically the releasing error itself, joins it so the whole history leaves in order.
      hold(event)
      scheduleRelease()
      return
    }

    forward(event)
  })

  const releaseSubscription = lifeCycle.subscribe(LifeCycleEventType.SESSION_RELEASED, ({ sessionId, reason }) => {
    if (withheldForSessionId !== sessionId) {
      return
    }
    if (reason === 'force') {
      // The host asked for this session now, so there is no herd to spread.
      release()
    } else {
      // The releasing error itself is collected right after, in the same notification.
      scheduleRelease()
    }
  })

  // The renewal is announced after its first events may already be held - the page collection
  // re-opens the current page for the new session in the same notification - so only a buffer
  // still held for another session is settled here.
  const renewSubscription = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, ({ session }) => {
    if (withheldForSessionId !== session.id) {
      settleBuffer(true)
    }
  })

  /**
   * Called when what is held may not get another chance to leave. A session that was released is
   * sent now rather than lost to the jitter window. `discardIfUnreleased` says whether the buffer
   * has anything left to wait for: a session that ended does not, an app in the background does.
   */
  function settleBuffer(discardIfUnreleased: boolean) {
    if (withheldForSessionId === undefined) {
      return
    }
    if (releaseTimer !== undefined) {
      release()
    } else if (discardIfUnreleased) {
      clearBuffer()
    }
  }

  function hold(event: RumEvent) {
    const serialized = jsonStringify(event)
    const eventBytes = serialized === undefined ? Infinity : utf8Size(serialized)
    if (serialized === undefined || eventBytes > WITHHELD_BUFFER_BYTES_LIMIT) {
      // It could never be part of a released buffer: the batch carries nothing it cannot
      // serialize, and holding an event larger than the whole budget would evict the minute before
      // it. The releasing error takes the other path, where it is forwarded on its own.
      droppedCount += 1
      return
    }

    if (event.type === 'view') {
      // Upsert: a view event is cumulative, so the latest one supersedes the ones before it. The
      // delete moves it to the back, so the first entry is the least recently updated view.
      views.delete(event.view.id)
      views.set(event.view.id, { serialized, date: event.date })
      // A view event carries its view's start date, so a late update of a view that already ended
      // does not make it current again - the next error hangs from the view really in progress.
      if (event.date >= currentViewDate) {
        currentViewDate = event.date
        currentViewId = event.view.id
      }
      evictViews()
      prune()
      return
    }

    details.push({
      serialized,
      viewId: event.view.id,
      time: Date.now(),
      bytes: eventBytes,
      tier: getEvictionTier(event),
      isError: event.type === 'error',
    })
    bytes += eventBytes

    prune()
    while (details.length > WITHHELD_BUFFER_EVENTS_LIMIT || bytes > WITHHELD_BUFFER_BYTES_LIMIT) {
      if (!evictOne()) {
        break
      }
    }
  }

  /** Drops what has aged out of the window, so the span kept is the one promised. */
  function prune() {
    // Once a release is scheduled the window stops moving: a timer delayed in the background must
    // not throw away exactly the minute before the error that the release exists to deliver.
    const oldestAllowed = (releaseScheduledAt ?? Date.now()) - WITHHELD_BUFFER_DURATION
    let cutoff = 0
    while (cutoff < details.length && details[cutoff].time < oldestAllowed) {
      bytes -= details[cutoff].bytes
      droppedCount += 1
      cutoff += 1
    }
    if (cutoff > 0) {
      details = details.slice(cutoff)
    }

    // A view with no detail left inside the window has nothing left to contain. The view in
    // progress always stays: it is the container the error will hang from.
    const viewsWithDetail = new Set(details.map((held) => held.viewId))
    views.forEach((_, viewId) => {
      if (viewId !== currentViewId && !viewsWithDetail.has(viewId)) {
        views.delete(viewId)
      }
    })
  }

  /**
   * Keeps the views within their limit, least recently updated first. The view in progress and the
   * view the first held error hangs from are never evicted: they are the containers the error that
   * released the session and the next one need. Only those two, so the limit stays a limit.
   */
  function evictViews() {
    if (views.size <= WITHHELD_BUFFER_VIEWS_LIMIT) {
      return
    }
    const keptViewIds = new Set<string>()
    const firstError = details.find((held) => held.isError)
    if (firstError) {
      keptViewIds.add(firstError.viewId)
    }
    if (currentViewId !== undefined) {
      keptViewIds.add(currentViewId)
    }
    const evictableViewIds: string[] = []
    views.forEach((_, viewId) => {
      if (!keptViewIds.has(viewId)) {
        evictableViewIds.push(viewId)
      }
    })
    evictableViewIds.slice(0, Math.max(0, views.size - WITHHELD_BUFFER_VIEWS_LIMIT)).forEach((viewId) => views.delete(viewId))
  }

  /** Removes one event of the least valuable tier present. Returns false when there is none left. */
  function evictOne() {
    for (const tier of [EvictionTier.FIRST, EvictionTier.LAST]) {
      const index = details.findIndex((held) => held.tier === tier)
      if (index !== -1) {
        evictAt(index)
        return true
      }
    }
    for (let index = details.length - 1; index >= 0; index -= 1) {
      if (details[index].tier === EvictionTier.LAST_RESORT) {
        evictAt(index)
        return true
      }
    }
    return false
  }

  function evictAt(index: number) {
    bytes -= details[index].bytes
    droppedCount += 1
    details.splice(index, 1)
  }

  function scheduleRelease() {
    if (releaseTimer !== undefined) {
      return
    }
    releaseScheduledAt = Date.now()
    releaseTimer = setTimeout(release, computeReleaseDelay(withheldForSessionId!))
  }

  function release() {
    prune()

    // Views oldest first: the backend builds the session out of whichever view arrives first. Then
    // the errors, then the rest oldest first: when the app is leaving, only the first requests are
    // sure to go, and the error is what the session is kept for. Views only order the release: a
    // detail with no held view - collected with page tracking off, or before the first page - is
    // still part of the errored session's history and goes out with it.
    const orderedViews: WithheldView[] = []
    views.forEach((view) => orderedViews.push(view))
    orderedViews.sort((left, right) => left.date - right.date)
    const errors: string[] = []
    const others: string[] = []
    details.forEach((held) => (held.isError ? errors : others).push(held.serialized))
    const released = [...orderedViews.map((view) => view.serialized), ...errors, ...others]
    const stats = { viewsCount: views.size, eventsCount: details.length, droppedCount, bytes }

    // Cleared before forwarding: the batch may call host code synchronously while it flushes, and
    // an event collected there belongs after the release, not in a buffer about to be emptied.
    clearBuffer()
    released.forEach((serialized) => forward(JSON.parse(serialized) as RumEvent))

    if (debug) {
      try {
        console.log('[FlashCat RUM][Debug] Error session event buffer released', stats)
      } catch {
        // Console implementations are host code and must not affect the release.
      }
    }
  }

  function clearBuffer() {
    if (releaseTimer !== undefined) {
      clearTimeout(releaseTimer)
    }
    releaseTimer = undefined
    releaseScheduledAt = undefined
    views = new Map()
    details = []
    bytes = 0
    droppedCount = 0
    currentViewId = undefined
    currentViewDate = -Infinity
    withheldForSessionId = undefined
  }

  return {
    flushOnAppHide: () => settleBuffer(false),
    stop: () => {
      // Unsubscribed first, so nothing listens on any more whatever settling runs into.
      eventSubscription.unsubscribe()
      releaseSubscription.unsubscribe()
      renewSubscription.unsubscribe()
      settleBuffer(true)
    },
  }
}

function getEvictionTier(event: RumEvent): EvictionTier {
  switch (event.type) {
    case 'error':
      // The SDK's own report is not what the session is kept for, and must not outlast the
      // application error that is.
      return event.error.source === 'agent' ? EvictionTier.LAST : EvictionTier.LAST_RESORT
    case 'resource': {
      // A request that failed is part of how the error happened; one that succeeded rarely is.
      // An unknown status code is treated like an ordinary success.
      const statusCode = event.resource.status_code ?? -1
      return statusCode === 0 || statusCode >= 400 || event.resource.error_message
        ? EvictionTier.LAST
        : EvictionTier.FIRST
    }
    default:
      return EvictionTier.LAST
  }
}

/**
 * Deterministic per session, so a client always spreads to the same offset.
 *
 * Multiplicative rather than a running sum: session ids are same-length strings drawn from the same
 * small alphabet, so summing their character codes lands almost every session within a few hundred
 * milliseconds of the same value - which delays the herd instead of spreading it.
 */
export function computeReleaseDelay(sessionId: string) {
  let hash = 0
  for (let i = 0; i < sessionId.length; i += 1) {
    hash = Math.imul(hash, 31) + sessionId.charCodeAt(i)
  }
  return Math.abs(hash) % WITHHELD_BUFFER_RELEASE_MAX_DELAY
}

/** UTF-8 size of the serialized event, which is what the budget is promised in. */
function sizeOf(event: RumEvent) {
  return utf8Size(jsonStringify(event) ?? '')
}

function utf8Size(candidate: string) {
  let count = 0
  for (let i = 0; i < candidate.length; i += 1) {
    const code = candidate.charCodeAt(i)
    if (code < 0x80) {
      count += 1
    } else if (code < 0x800) {
      count += 2
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // A surrogate pair encodes one code point in four bytes.
      count += 4
      i += 1
    } else {
      count += 3
    }
  }
  return count
}
