import type { ContextManager, SessionManager } from '@flashcatcloud/miniprogram-core'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { RawRumEvent } from '../rawRumEvent.types'
import type { RumConfiguration } from './configuration/configuration'
import type { RumEvent } from '../rumEvent.types'
import type { PageHistoryEntry } from './contexts/pageHistory'

export function startRumAssembly({
  lifeCycle,
  configuration,
  sessionManager,
  globalContext,
  userContext,
  getCurrentPage,
}: {
  lifeCycle: LifeCycle
  configuration: RumConfiguration
  sessionManager: SessionManager
  globalContext: ContextManager
  userContext: ContextManager
  getCurrentPage: () => PageHistoryEntry | undefined
}) {
  const subscription = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (rawEvent: RawRumEvent) => {
    const session = sessionManager.findTrackedSession() || sessionManager.renew()
    const page = getCurrentPage()
    const rumEvent: RumEvent = {
      ...rawEvent,
      application: { id: configuration.applicationId },
      session: { id: session.id },
      view: {
        id: page?.id || 'unknown',
        name: page?.name || 'unknown',
      },
      user: userContext.getContext(),
      context: globalContext.getContext(),
    }

    const allow = configuration.beforeSend ? configuration.beforeSend(rumEvent) !== false : true
    if (allow) {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, rumEvent)
    }
  })

  return {
    stop: () => subscription.unsubscribe(),
  }
}
