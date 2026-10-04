import test from 'node:test'
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { startSessionManager } from '../packages/core/src/domain/session/sessionManager'
import type { SessionState } from '../packages/core/src/domain/session/sessionManager'
import { LifeCycle, LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import { startSessionErrorTracking } from '../packages/miniprogram-rum/src/domain/trackSessionError'
import {
  WITHHELD_BUFFER_BYTES_LIMIT,
  WITHHELD_BUFFER_DURATION,
  WITHHELD_BUFFER_EVENTS_LIMIT,
  WITHHELD_BUFFER_RELEASE_MAX_DELAY,
  WITHHELD_BUFFER_VIEWS_LIMIT,
  computeReleaseDelay,
  startWithheldEventBuffer,
} from '../packages/miniprogram-rum/src/transport/withheldEventBuffer'
import type { RumEvent } from '../packages/miniprogram-rum/src/rumEvent.types'

function createStore() {
  let stored: SessionState | undefined
  return {
    get: () => stored,
    set: (state: SessionState) => {
      stored = state
    },
    clear: () => {
      stored = undefined
    },
  }
}

function setup(t: TestContext, { sessionSampleRate = 0, sessionOnError = true } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 })
  const lifeCycle = new LifeCycle()
  const sessionManager = startSessionManager(createStore(), { sessionSampleRate, sessionOnError })
  let session = sessionManager.renew()
  // Subscribed in the same order as startRum: the release trigger runs before the buffer.
  const errorTracking = startSessionErrorTracking(lifeCycle, sessionManager)
  const forwarded: RumEvent[] = []
  const buffer = startWithheldEventBuffer(lifeCycle, sessionManager, (event) => forwarded.push(event))
  t.after(() => {
    buffer.stop()
    errorTracking.unsubscribe()
  })

  function collect(type: RumEvent['type'], overrides: Record<string, unknown> = {}) {
    const event = {
      type,
      date: Date.now(),
      application: { id: 'app' },
      source: 'miniprogram',
      session: { id: session.id, type: 'user', has_replay: false, sampled_for_replay: false },
      view: { id: 'view-1', url: 'pages/index', name: 'pages/index' },
      ...(type === 'resource' ? { resource: { id: 'r', type: 'xhr', url: '/', method: 'GET', status_code: 200, duration: 1 } } : {}),
      ...(type === 'error' ? { error: { id: 'e', message: 'boom', source: 'app' } } : {}),
      ...(type === 'action' ? { action: { id: 'a', type: 'tap', target: { name: 'button' } } } : {}),
      ...overrides,
    } as unknown as RumEvent
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, event)
    return event
  }

  function releasedAfterJitter() {
    t.mock.timers.tick(WITHHELD_BUFFER_RELEASE_MAX_DELAY)
    return forwarded
  }

  function renew() {
    session = sessionManager.renew()
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED, { session })
    return session
  }

  return {
    lifeCycle,
    sessionManager,
    buffer,
    forwarded,
    collect,
    releasedAfterJitter,
    renew,
    getSession: () => session,
    tick: (ms: number) => t.mock.timers.tick(ms),
  }
}

test('uploads nothing while the session has not reported an error', (t) => {
  const { collect, forwarded, tick } = setup(t)
  collect('view')
  collect('resource')
  collect('action')
  tick(30_000)
  assert.equal(forwarded.length, 0)
})

test('forwards immediately when the session is not withholding', (t) => {
  const { collect, forwarded } = setup(t, { sessionSampleRate: 100 })
  collect('view')
  collect('resource')
  assert.equal(forwarded.length, 2)
})

test('releases the buffer behind the jitter once the session reports an error', (t) => {
  const { collect, forwarded, tick, getSession } = setup(t)
  collect('view')
  collect('resource')
  collect('error')
  assert.equal(forwarded.length, 0, 'nothing leaves before the jitter')
  tick(computeReleaseDelay(getSession().id))
  assert.deepEqual(
    forwarded.map((event) => event.type),
    ['view', 'error', 'resource'],
  )
})

test('forwards an event collected after the release instead of holding it again', (t) => {
  const { collect, forwarded, releasedAfterJitter } = setup(t)
  collect('view')
  collect('error')
  releasedAfterJitter()
  const forwardedAfterRelease = forwarded.length
  collect('resource')
  assert.equal(forwarded.length, forwardedAfterRelease + 1)
})

test('an event arriving while the release waits on jitter joins the same ordered release', (t) => {
  const { collect, forwarded, releasedAfterJitter } = setup(t)
  collect('view')
  collect('error')
  collect('action')
  assert.equal(forwarded.length, 0)
  assert.deepEqual(
    releasedAfterJitter().map((event) => event.type),
    ['view', 'error', 'action'],
  )
})

test('releases immediately, without jitter, when the session is forced', (t) => {
  const { collect, forwarded, lifeCycle, sessionManager, getSession } = setup(t)
  collect('view')
  collect('resource')
  assert.equal(sessionManager.release(getSession().id), true)
  lifeCycle.notify(LifeCycleEventType.SESSION_RELEASED, { sessionId: getSession().id, reason: 'force' })
  assert.equal(forwarded.length, 2)
})

test('ignores a release notification for another session', (t) => {
  const { collect, lifeCycle, releasedAfterJitter } = setup(t)
  collect('view')
  lifeCycle.notify(LifeCycleEventType.SESSION_RELEASED, { sessionId: 'other-session', reason: 'force' })
  assert.equal(releasedAfterJitter().length, 0)
})

test('an error dropped before assembly reaches the buffer releases nothing', (t) => {
  // beforeSend runs inside assembly, so an error it drops is never collected here at all.
  const { collect, releasedAfterJitter } = setup(t)
  collect('view')
  collect('resource')
  assert.equal(releasedAfterJitter().length, 0)
})

test('the SDK own error report does not release the buffer', (t) => {
  const { collect, releasedAfterJitter } = setup(t)
  collect('view')
  collect('error', { error: { id: 'e', message: 'Reached max number of actions by minute: 3000', source: 'agent' } })
  assert.equal(releasedAfterJitter().length, 0)
})

test('keeps only the latest event of a view, since a view event supersedes the ones before it', (t) => {
  const { collect, releasedAfterJitter } = setup(t)
  collect('view', { _dd: { document_version: 1 } })
  collect('view', { _dd: { document_version: 2 } })
  collect('error')
  const views = releasedAfterJitter().filter((event) => event.type === 'view')
  assert.equal(views.length, 1)
  assert.equal((views[0] as any)._dd.document_version, 2)
})

test('drops detail that has aged out of the window', (t) => {
  const { collect, releasedAfterJitter, tick } = setup(t)
  collect('view')
  collect('action', { action: { id: 'old', type: 'tap', target: { name: 'old' } } })
  tick(WITHHELD_BUFFER_DURATION + 1)
  collect('action', { action: { id: 'recent', type: 'tap', target: { name: 'recent' } } })
  collect('error')
  const actions = releasedAfterJitter().filter((event) => event.type === 'action')
  assert.deepEqual(
    actions.map((event: any) => event.action.id),
    ['recent'],
  )
})

test('keeps the minute before the error when the release timer is held back', (t) => {
  const { collect, forwarded, tick, getSession } = setup(t)
  collect('view')
  tick(30_000)
  collect('action')
  collect('error')
  // A background timer may fire far later than asked: the window stays frozen at scheduling time.
  tick(WITHHELD_BUFFER_DURATION + computeReleaseDelay(getSession().id))
  assert.deepEqual(
    forwarded.map((event) => event.type),
    ['view', 'error', 'action'],
  )
})

test('drops the buffer, and what is still arriving for it, when the session ends without an error', (t) => {
  const { collect, forwarded, renew, releasedAfterJitter } = setup(t, { sessionSampleRate: 0 })
  const first = collect('view')
  collect('resource')
  renew()
  // A request of the discarded session completing after its renewal.
  collect('resource', { session: first.session })
  assert.equal(releasedAfterJitter().length, 0)
  assert.equal(forwarded.length, 0)
})

test('sends a release that is still waiting on jitter when the session ends', (t) => {
  const { collect, forwarded, renew } = setup(t)
  const first = collect('view')
  collect('error')
  renew()
  assert.equal(forwarded.length, 2)
  // A straggler of the released session still uploads.
  collect('resource', { session: first.session })
  assert.equal(forwarded.length, 3)
})

test('settles the buffer when the session expired or stopped without a renewal yet', (t) => {
  const { collect, forwarded, sessionManager, releasedAfterJitter, getSession } = setup(t)
  const first = collect('view')
  sessionManager.expire()
  collect('resource', { session: first.session })
  assert.equal(releasedAfterJitter().length, 0)
  assert.equal(forwarded.length, 0)
  assert.ok(getSession())
})

test('still drops a straggler of a session discarded several renewals ago', (t) => {
  const { collect, forwarded, renew } = setup(t)
  const first = collect('view')
  for (let i = 0; i < 3; i += 1) {
    renew()
    collect('view', { view: { id: `view-${i + 2}`, url: 'p', name: 'p' } })
  }
  renew()
  collect('resource', { session: first.session })
  assert.equal(forwarded.length, 0)
})

test('forgets a discarded session after four more have been discarded', (t) => {
  const { collect, forwarded, renew } = setup(t)
  const first = collect('view')
  for (let i = 0; i < 4; i += 1) {
    renew()
    collect('view', { view: { id: `view-${i + 2}`, url: 'p', name: 'p' } })
  }
  renew()
  collect('resource', { session: first.session })
  assert.equal(forwarded.length, 1)
})

test('forwards a straggler of a session that was never withholding', (t) => {
  const { collect, forwarded } = setup(t)
  collect('view')
  collect('resource', { session: { id: 'plain-session' } })
  assert.equal(forwarded.length, 1)
})

test('keeps the buffer when the app is only hidden, since it comes back', (t) => {
  const { buffer, collect, releasedAfterJitter } = setup(t)
  collect('view')
  collect('resource')
  buffer.flushOnAppHide()
  assert.equal(releasedAfterJitter().length, 0)
  collect('error')
  assert.equal(releasedAfterJitter().length, 3)
})

test('sends a release still waiting on jitter when the app is hidden', (t) => {
  const { buffer, collect, forwarded } = setup(t)
  collect('view')
  collect('error')
  buffer.flushOnAppHide()
  assert.equal(forwarded.length, 2)
})

test('discards an unreleased buffer when stopping', (t) => {
  const stopped = setup(t)
  stopped.collect('view')
  stopped.buffer.stop()
  assert.equal(stopped.forwarded.length, 0)
})

test('settles an errored buffer before stopping and does not forward again', (t) => {
  const { buffer, collect, forwarded, releasedAfterJitter } = setup(t)
  collect('view')
  collect('error')
  buffer.stop()
  assert.equal(forwarded.length, 2)
  buffer.stop()
  assert.equal(releasedAfterJitter().length, 2)
})

test('drops successful requests before actions when it runs out of room', (t) => {
  const { collect, releasedAfterJitter } = setup(t)
  collect('view')
  collect('action')
  for (let i = 0; i < WITHHELD_BUFFER_EVENTS_LIMIT; i += 1) {
    collect('resource')
  }
  collect('error')
  const released = releasedAfterJitter()
  const details = released.filter((event) => event.type !== 'view')
  assert.ok(details.length <= WITHHELD_BUFFER_EVENTS_LIMIT)
  assert.ok(details.length < WITHHELD_BUFFER_EVENTS_LIMIT + 2, 'successful requests were evicted')
  assert.equal(released.filter((event) => event.type === 'action').length, 1)
  assert.equal(released.filter((event) => event.type === 'error').length, 1)
})

test('gives up requests that succeeded before those that failed', (t) => {
  const { collect, releasedAfterJitter } = setup(t)
  collect('view')
  collect('resource', { resource: { id: 'failed', type: 'xhr', url: '/', method: 'GET', status_code: 500, duration: 1 } })
  for (let i = 0; i < WITHHELD_BUFFER_EVENTS_LIMIT; i += 1) {
    collect('resource')
  }
  collect('error')
  const ids = releasedAfterJitter()
    .filter((event) => event.type === 'resource')
    .map((event: any) => event.resource.id)
  assert.ok(ids.includes('failed'))
})

test('gives up detail once the bytes budget is spent, keeping the error', (t) => {
  const { collect, releasedAfterJitter } = setup(t)
  collect('view')
  const padding = 'x'.repeat(10 * 1024)
  for (let i = 0; i < 10; i += 1) {
    collect('resource', { context: { padding } })
  }
  collect('error')
  const released = releasedAfterJitter()
  const resources = released.filter((event) => event.type === 'resource')
  assert.ok(resources.length < 10 && resources.length >= 5, `kept ${resources.length}`)
  assert.equal(released.filter((event) => event.type === 'error').length, 1)
  const bytes = released
    .filter((event) => event.type !== 'view')
    .reduce((total, event) => total + JSON.stringify(event).length, 0)
  assert.ok(bytes <= WITHHELD_BUFFER_BYTES_LIMIT)
})

test('drops a single event larger than the whole budget instead of evicting the minute for it', (t) => {
  const { collect, releasedAfterJitter } = setup(t)
  collect('view')
  collect('action')
  collect('resource', { context: { padding: 'x'.repeat(WITHHELD_BUFFER_BYTES_LIMIT) } })
  collect('error')
  assert.deepEqual(
    releasedAfterJitter().map((event) => event.type),
    ['view', 'error', 'action'],
  )
})

test('forwards a releasing error larger than the budget on its own and keeps the history behind the jitter', (t) => {
  const { collect, forwarded, releasedAfterJitter } = setup(t)
  collect('view')
  collect('action')
  collect('error', {
    error: { id: 'huge', message: 'x'.repeat(WITHHELD_BUFFER_BYTES_LIMIT), source: 'app' },
  })
  assert.deepEqual(
    forwarded.map((event: any) => event.error?.id),
    ['huge'],
  )
  assert.deepEqual(
    releasedAfterJitter().map((event) => event.type),
    ['error', 'view', 'action'],
  )
})

test('evicts the newest error first when only errors are over budget', (t) => {
  const { collect, lifeCycle, getSession, forwarded } = setup(t)
  collect('view')
  // Collected straight through the buffer, bypassing the trigger, to fill it with errors only.
  for (let i = 0; i <= WITHHELD_BUFFER_EVENTS_LIMIT; i += 1) {
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: 'error',
      date: Date.now(),
      session: { id: getSession().id },
      view: { id: 'view-1' },
      error: { id: `error-${i}`, message: 'boom', source: 'agent' },
    } as unknown as RumEvent)
  }
  lifeCycle.notify(LifeCycleEventType.SESSION_RELEASED, { sessionId: getSession().id, reason: 'force' })
  const ids = forwarded.filter((event) => event.type === 'error').map((event: any) => event.error.id)
  assert.equal(ids.length, WITHHELD_BUFFER_EVENTS_LIMIT)
  assert.equal(ids[0], 'error-0')
  assert.equal(ids.includes(`error-${WITHHELD_BUFFER_EVENTS_LIMIT}`), false)
})

test('releases every detail alongside the view it hangs from, views oldest first', (t) => {
  const { collect, releasedAfterJitter, tick } = setup(t)
  collect('view', { date: Date.now(), view: { id: 'view-a', url: 'a', name: 'a' } })
  collect('action', { view: { id: 'view-a', url: 'a', name: 'a' } })
  tick(1_000)
  collect('view', { date: Date.now(), view: { id: 'view-b', url: 'b', name: 'b' } })
  // A late update of the first view: the map now holds it last, but it started first.
  collect('view', { date: Date.now() - 1_000, view: { id: 'view-a', url: 'a', name: 'a' } })
  collect('error', { view: { id: 'view-b', url: 'b', name: 'b' } })
  const released = releasedAfterJitter()
  assert.deepEqual(
    released.map((event) => `${event.type}:${event.view.id}`),
    ['view:view-a', 'view:view-b', 'error:view-b', 'action:view-a'],
  )
})

test('lets a view go once none of its detail is left inside the window', (t) => {
  const { collect, releasedAfterJitter, tick } = setup(t)
  collect('view', { date: Date.now(), view: { id: 'view-a', url: 'a', name: 'a' } })
  collect('action', { view: { id: 'view-a', url: 'a', name: 'a' } })
  tick(1_000)
  collect('view', { date: Date.now(), view: { id: 'view-b', url: 'b', name: 'b' } })
  tick(WITHHELD_BUFFER_DURATION)
  collect('error', { view: { id: 'view-b', url: 'b', name: 'b' } })
  assert.deepEqual(
    releasedAfterJitter().map((event) => `${event.type}:${event.view.id}`),
    ['view:view-b', 'error:view-b'],
  )
})

test('keeps no more views than its limit and never the one in progress', (t) => {
  const { collect, releasedAfterJitter, tick } = setup(t)
  for (let i = 0; i < WITHHELD_BUFFER_VIEWS_LIMIT + 10; i += 1) {
    tick(10)
    collect('view', { date: Date.now(), view: { id: `view-${i}`, url: 'p', name: 'p' } })
    collect('action', { view: { id: `view-${i}`, url: 'p', name: 'p' } })
  }
  const lastViewId = `view-${WITHHELD_BUFFER_VIEWS_LIMIT + 9}`
  collect('error', { view: { id: lastViewId, url: 'p', name: 'p' } })
  const released = releasedAfterJitter()
  const views = released.filter((event) => event.type === 'view')
  assert.equal(views.length, WITHHELD_BUFFER_VIEWS_LIMIT)
  assert.equal(views[views.length - 1].view.id, lastViewId)
  assert.ok(released.some((event) => event.type === 'error'))
})

test('keeps the view an error hangs from when a view that already ended is updated late', (t) => {
  const { collect, releasedAfterJitter, tick } = setup(t)
  collect('view', { date: Date.now(), view: { id: 'view-a', url: 'a', name: 'a' } })
  tick(1_000)
  collect('view', { date: Date.now(), view: { id: 'view-b', url: 'b', name: 'b' } })
  // The final update of the ended view arrives after the current one.
  collect('view', { date: Date.now() - 1_000, view: { id: 'view-a', url: 'a', name: 'a' } })
  collect('error', { view: { id: 'view-b', url: 'b', name: 'b' } })
  const released = releasedAfterJitter()
  assert.ok(released.some((event) => event.type === 'error' && event.view.id === 'view-b'))
  assert.ok(released.some((event) => event.type === 'view' && event.view.id === 'view-b'))
})

test('computeReleaseDelay stays within the release window and is deterministic', () => {
  for (const id of ['a', 'b0b6b9ce-8f0a-4c8f-9a7e-3c1d2e4f5a6b', 'ffffffff-ffff-ffff-ffff-ffffffffffff']) {
    const delay = computeReleaseDelay(id)
    assert.ok(delay >= 0 && delay < WITHHELD_BUFFER_RELEASE_MAX_DELAY)
    assert.equal(computeReleaseDelay(id), delay)
  }
})

test('computeReleaseDelay spreads sessions across the window rather than bunching them up', () => {
  const buckets = new Array(10).fill(0)
  for (let i = 0; i < 2000; i += 1) {
    const id = randomUUID()
    buckets[Math.floor((computeReleaseDelay(id) / WITHHELD_BUFFER_RELEASE_MAX_DELAY) * 10)] += 1
  }
  // Every 300ms bucket gets a fair share (expected 200 each).
  for (const count of buckets) {
    assert.ok(count > 120 && count < 280, `buckets ${buckets.join(',')}`)
  }
})

test('an error of an earlier session does not release the current one', (t) => {
  const { collect, releasedAfterJitter, sessionManager, getSession } = setup(t)
  collect('view')
  collect('error', { session: { id: 'earlier-session' } })
  assert.equal(releasedAfterJitter().filter((event) => event.session.id === getSession().id).length, 0)
  assert.equal(sessionManager.findSession()?.isReleased, undefined)
})

test('releases the error and its history when the session has no view at all', (t) => {
  const { collect, releasedAfterJitter } = setup(t)
  collect('action')
  collect('error')
  assert.deepEqual(
    releasedAfterJitter().map((event) => event.type),
    ['error', 'action'],
  )
})

test('releases detail collected before the first view alongside the views', (t) => {
  const { collect, releasedAfterJitter, tick } = setup(t)
  const unknownView = { view: { id: 'unknown', url: 'unknown', name: 'unknown' } }
  collect('action', unknownView)
  collect('error', { ...unknownView, error: { id: 'launch', message: 'launch failed', source: 'promise' } })
  tick(10)
  collect('view', { date: Date.now() })
  assert.deepEqual(
    releasedAfterJitter().map((event) => `${event.type}:${event.view.id}`),
    ['view:view-1', 'error:unknown', 'action:unknown'],
  )
})
