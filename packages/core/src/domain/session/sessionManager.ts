import { generateUUID } from '../../tools/utils/stringUtils'
import { now } from '../../tools/utils/timeUtils'
import { createValueHistory } from '../../tools/valueHistory'

const SESSION_TIME_OUT_DELAY = 4 * 60 * 60 * 1000 // 4 hours
const SESSION_EXPIRATION_DELAY = 15 * 60 * 1000 // 15 minutes
const EXPAND_THROTTLE = 60 * 1000 // 1 minute
const SESSION_HISTORY_MAX_ENTRIES = Math.ceil(SESSION_TIME_OUT_DELAY / EXPAND_THROTTLE) + 2

export interface SessionState {
  id: string
  created: number
  expireAt: number
  anonymousId?: string
  isTracked?: boolean
  /** The sampling rate used for this session's single draw. */
  sessionSampleRate?: number
  /** The remote configuration version applied when this session was created. */
  rcVersion?: number
}

export interface SessionStore {
  get: () => SessionState | undefined
  set: (state: SessionState) => void
  clear: () => void
}

export interface SessionConfiguration {
  sessionSampleRate: number
  rcVersion: number
  custom?: Record<string, unknown> | null
}

export interface BeforeSamplingContext {
  readonly sessionSampleRate: number
  readonly custom: Record<string, unknown> | null
}

export type BeforeSamplingCallback = (context: BeforeSamplingContext) => number | undefined

export interface SessionManager {
  findSession: (time?: number) => SessionState | undefined
  findTrackedSession: (time?: number) => SessionState | undefined
  renew: () => SessionState
  setForcedSession: () => void
  expand: () => void
  expire: () => void
}

export function startSessionManager(
  store: SessionStore,
  {
    trackAnonymousUser = true,
    sessionSampleRate = 100,
    getSessionConfiguration,
    beforeSampling,
  }: {
    trackAnonymousUser?: boolean
    sessionSampleRate?: number
    getSessionConfiguration?: () => SessionConfiguration
    beforeSampling?: BeforeSamplingCallback
  } = {},
): SessionManager {
  let lastExpand = 0
  let forceNextSession = false
  const sessionHistory = createValueHistory<SessionState>(() => now(), {
    expireDelay: SESSION_TIME_OUT_DELAY,
    maxEntries: SESSION_HISTORY_MAX_ENTRIES,
  })
  const initialSession = store.get()

  if (initialSession) {
    let wasMigrated = false
    // Sessions written by older SDK versions did not persist these fields. Lock
    // them to the init value so an SDK upgrade cannot change an active draw.
    if (initialSession.sessionSampleRate === undefined) {
      initialSession.sessionSampleRate = sessionSampleRate
      wasMigrated = true
    }
    if (initialSession.rcVersion === undefined) {
      initialSession.rcVersion = 0
      wasMigrated = true
    }
    if (wasMigrated) {
      try {
        store.set(initialSession)
      } catch {
        // A storage failure must not prevent the in-memory session from being used.
      }
    }
    sessionHistory.add(cloneSessionState(initialSession), initialSession.created)
  }

  function isExpiredAt(state: SessionState, time: number) {
    return state.expireAt <= time || time - state.created >= SESSION_TIME_OUT_DELAY
  }

  function createSession(): SessionState {
    const time = now()
    let currentConfiguration: SessionConfiguration = { sessionSampleRate, rcVersion: 0, custom: null }
    if (getSessionConfiguration) {
      try {
        currentConfiguration = getSessionConfiguration()
      } catch {
        // Keep initialization values when a dynamic provider fails.
      }
    }
    let resolvedSessionSampleRate = currentConfiguration.sessionSampleRate
    if (beforeSampling) {
      try {
        const overriddenRate = beforeSampling({
          sessionSampleRate: resolvedSessionSampleRate,
          custom: cloneCustom(currentConfiguration.custom || null),
        })
        if (isSampleRate(overriddenRate)) {
          resolvedSessionSampleRate = overriddenRate
        }
      } catch {
        // Host callbacks must never prevent a session from being created.
      }
    }

    const isForced = forceNextSession
    forceNextSession = false
    return {
      id: generateUUID(),
      created: time,
      expireAt: time + SESSION_EXPIRATION_DELAY,
      anonymousId: trackAnonymousUser ? store.get()?.anonymousId || generateUUID() : undefined,
      isTracked: isForced || performDraw(resolvedSessionSampleRate),
      sessionSampleRate: resolvedSessionSampleRate,
      rcVersion: currentConfiguration.rcVersion,
    }
  }

  function findSession(time?: number): SessionState | undefined {
    if (time !== undefined) {
      const historicalSession = sessionHistory.find(time)?.value
      if (historicalSession && !isExpiredAt(historicalSession, time)) {
        return historicalSession
      }
      return undefined
    }
    const state = store.get()
    if (!state || isExpiredAt(state, now())) {
      return undefined
    }
    return state
  }

  return {
    findSession,
    findTrackedSession: (time) => {
      const state = findSession(time)
      if (!state || state.isTracked === false) {
        return undefined
      }
      return state
    },
    renew: () => {
      const state = createSession()
      store.set(state)
      sessionHistory.add(cloneSessionState(state), state.created)
      lastExpand = now()
      return state
    },
    setForcedSession: () => {
      forceNextSession = true
    },
    expand: () => {
      const t = now()
      if (t - lastExpand < EXPAND_THROTTLE) {
        return
      }
      const state = store.get()
      if (state && !isExpiredAt(state, t)) {
        state.expireAt = t + SESSION_EXPIRATION_DELAY
        store.set(state)
        sessionHistory.add(cloneSessionState(state), t)
        lastExpand = t
      }
    },
    expire: () => {
      store.clear()
      sessionHistory.closeActive(now())
    },
  }
}

function cloneSessionState(state: SessionState): SessionState {
  return { ...state }
}

function performDraw(sampleRate: number): boolean {
  return Math.random() * 100 < sampleRate
}

function isSampleRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

function cloneCustom(custom: Record<string, unknown> | null): Record<string, unknown> | null {
  if (custom === null) {
    return null
  }
  try {
    const cloned = JSON.parse(JSON.stringify(custom))
    return isRecord(cloned) ? cloned : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
