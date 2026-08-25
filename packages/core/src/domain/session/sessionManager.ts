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

export interface SessionManager {
  findSession: (time?: number) => SessionState | undefined
  findTrackedSession: (time?: number) => SessionState | undefined
  renew: () => SessionState
  expand: () => void
  expire: () => void
}

export function startSessionManager(
  store: SessionStore,
  {
    trackAnonymousUser = true,
    sessionSampleRate = 100,
    getSessionConfiguration,
  }: {
    trackAnonymousUser?: boolean
    sessionSampleRate?: number
    getSessionConfiguration?: () => { sessionSampleRate: number; rcVersion: number }
  } = {},
): SessionManager {
  let lastExpand = 0
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
    let currentConfiguration = { sessionSampleRate, rcVersion: 0 }
    if (getSessionConfiguration) {
      try {
        currentConfiguration = getSessionConfiguration()
      } catch {
        // Keep initialization values when a dynamic provider fails.
      }
    }
    return {
      id: generateUUID(),
      created: time,
      expireAt: time + SESSION_EXPIRATION_DELAY,
      anonymousId: trackAnonymousUser ? store.get()?.anonymousId || generateUUID() : undefined,
      isTracked: performDraw(currentConfiguration.sessionSampleRate),
      sessionSampleRate: currentConfiguration.sessionSampleRate,
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
