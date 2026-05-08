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
}

export interface SessionStore {
  get: () => SessionState | undefined
  set: (state: SessionState) => void
  clear: () => void
}

export interface SessionManager {
  findTrackedSession: (time?: number) => SessionState | undefined
  renew: () => SessionState
  expand: () => void
  expire: () => void
}

export function startSessionManager(
  store: SessionStore,
  { trackAnonymousUser = true }: { trackAnonymousUser?: boolean } = {},
): SessionManager {
  let lastExpand = 0
  const sessionHistory = createValueHistory<SessionState>(() => now(), {
    expireDelay: SESSION_TIME_OUT_DELAY,
    maxEntries: SESSION_HISTORY_MAX_ENTRIES,
  })
  const initialSession = store.get()

  if (initialSession) {
    sessionHistory.add(cloneSessionState(initialSession), initialSession.created)
  }

  function isExpiredAt(state: SessionState, time: number) {
    return state.expireAt <= time || time - state.created >= SESSION_TIME_OUT_DELAY
  }

  function createSession(): SessionState {
    const time = now()
    return {
      id: generateUUID(),
      created: time,
      expireAt: time + SESSION_EXPIRATION_DELAY,
      anonymousId: trackAnonymousUser ? store.get()?.anonymousId || generateUUID() : undefined,
    }
  }

  return {
    findTrackedSession: (time) => {
      if (time !== undefined) {
        const historicalSession = sessionHistory.find(time)?.value
        if (historicalSession && !isExpiredAt(historicalSession, time)) {
          return historicalSession
        }
        return undefined
      }
      const state = store.get()
      if (!state) {
        return undefined
      }
      if (isExpiredAt(state, now())) {
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
