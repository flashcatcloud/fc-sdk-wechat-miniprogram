import { generateUUID } from '../../tools/utils/stringUtils'
import { now } from '../../tools/utils/timeUtils'

const SESSION_TIME_OUT_DELAY = 4 * 60 * 60 * 1000 // 4 hours
const SESSION_EXPIRATION_DELAY = 15 * 60 * 1000 // 15 minutes
const EXPAND_THROTTLE = 60 * 1000 // 1 minute

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
  expand: () => void
  expire: () => void
}

export function startSessionManager(store: SessionStore): SessionManager {
  let lastExpand = 0

  function isExpired(state: SessionState) {
    return state.expireAt <= now() || now() - state.created >= SESSION_TIME_OUT_DELAY
  }

  function createSession(): SessionState {
    const time = now()
    return {
      id: generateUUID(),
      created: time,
      expireAt: time + SESSION_EXPIRATION_DELAY,
    }
  }

  return {
    findTrackedSession: () => {
      const state = store.get()
      if (!state) {
        console.log('[Session] findTrackedSession: no session in store')
        return undefined
      }
      if (isExpired(state)) {
        const t = now()
        console.log('[Session] findTrackedSession: session expired', {
          id: state.id,
          expireAt: new Date(state.expireAt).toISOString(),
          created: new Date(state.created).toISOString(),
          now: new Date(t).toISOString(),
          idleExpired: state.expireAt <= t,
          hardTimeout: t - state.created >= SESSION_TIME_OUT_DELAY,
        })
        return undefined
      }
      return state
    },
    renew: () => {
      const prevState = store.get()
      const state = createSession()
      store.set(state)
      lastExpand = now()
      console.log('[Session] renew: new session created', {
        newId: state.id,
        prevId: prevState?.id,
        expireAt: new Date(state.expireAt).toISOString(),
        stack: new Error().stack,
      })
      return state
    },
    expand: () => {
      const t = now()
      if (t - lastExpand < EXPAND_THROTTLE) {
        return
      }
      const state = store.get()
      if (state && !isExpired(state)) {
        state.expireAt = t + SESSION_EXPIRATION_DELAY
        store.set(state)
        lastExpand = t
      }
    },
    expire: () => {
      store.clear()
    },
  }
}
