import { generateUUID } from '../../tools/utils/stringUtils'
import { now } from '../../tools/utils/timeUtils'

const SESSION_TIMEOUT = 4 * 60 * 1000 // 4 hours

export interface SessionState {
  id: string
  created: number
  expireAt: number
}

export interface SessionStore {
  get: () => SessionState | undefined
  set: (state: SessionState) => void
  clear: () => void
}

export interface SessionManager {
  findTrackedSession: () => SessionState | undefined
  renew: () => SessionState
  expire: () => void
}

export function startSessionManager(store: SessionStore): SessionManager {
  function isExpired(state: SessionState) {
    return state.expireAt <= now()
  }

  function createSession(): SessionState {
    const time = now()
    return {
      id: generateUUID(),
      created: time,
      expireAt: time + SESSION_TIMEOUT,
    }
  }

  return {
    findTrackedSession: () => {
      const state = store.get()
      if (!state || isExpired(state)) {
        return undefined
      }
      return state
    },
    renew: () => {
      const state = createSession()
      store.set(state)
      return state
    },
    expire: () => {
      store.clear()
    },
  }
}
