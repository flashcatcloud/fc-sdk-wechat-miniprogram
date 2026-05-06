import type { PlatformAdapter } from '@flashcatcloud/miniprogram-platform'
import type { SessionManager, SessionState, SessionStore } from '@flashcatcloud/miniprogram-core'
import { startSessionManager } from '@flashcatcloud/miniprogram-core'

const SESSION_STORAGE_KEY = 'fc_rum_session'

export function createSessionStore(adapter: PlatformAdapter): SessionStore {
  return {
    get: () => {
      const value = adapter.getStorageSync(SESSION_STORAGE_KEY)
      if (typeof value !== 'string') {
        return value as SessionState
      }
      try {
        return JSON.parse(value) as SessionState
      } catch {
        return undefined
      }
    },
    set: (state) => adapter.setStorageSync(SESSION_STORAGE_KEY, JSON.stringify(state)),
    clear: () => adapter.removeStorageSync(SESSION_STORAGE_KEY),
  }
}

export function startRumSessionManager(adapter: PlatformAdapter): SessionManager {
  return startSessionManager(createSessionStore(adapter))
}
