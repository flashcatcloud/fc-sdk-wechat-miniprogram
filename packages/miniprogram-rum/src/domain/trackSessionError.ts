import type { SessionManager } from '@flashcatcloud/miniprogram-core'
import { isWithholdingEvents } from '@flashcatcloud/miniprogram-core'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'

/**
 * Releases a session that withholds its events once it reports an error.
 *
 * It listens after assembly rather than on the raw error, so an error discarded by `beforeSend` or
 * by the rate limiter releases nothing: a session uploaded for an error that cannot be found
 * afterwards would be worse than no session at all. It must subscribe before the withheld event
 * buffer, which then sees the releasing error as part of a released session.
 */
export function startSessionErrorTracking(lifeCycle: LifeCycle, sessionManager: SessionManager) {
  return lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => {
    // The SDK's own reports are not the application reporting an error.
    if (event.type !== 'error' || event.error.source === 'agent') {
      return
    }
    const session = sessionManager.findSession()
    // Only the session the error belongs to, and only one that is still withholding: other
    // sessions never have their stored state written for this.
    if (!session || event.session?.id !== session.id || !isWithholdingEvents(session)) {
      return
    }
    if (sessionManager.release(session.id)) {
      lifeCycle.notify(LifeCycleEventType.SESSION_RELEASED, { sessionId: session.id, reason: 'error' })
    }
  })
}
