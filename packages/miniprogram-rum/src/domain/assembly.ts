import type { ContextManager, SessionManager } from '@flashcatcloud/miniprogram-core'
import type { EventRateLimiter } from '@flashcatcloud/miniprogram-core'
import { createEventRateLimiter } from '@flashcatcloud/miniprogram-core'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { RawRumEvent, RumEventType } from '../rawRumEvent.types'
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
  const eventRateLimiters = new Map<RumEventType, EventRateLimiter>()

  function getOrCreateRateLimiter(eventType: RumEventType): EventRateLimiter {
    let limiter = eventRateLimiters.get(eventType)
    if (!limiter) {
      limiter = createEventRateLimiter(
        eventType,
        configuration.eventRateLimiterThreshold,
        (error) => {
          lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
            date: Date.now(),
            type: 'error',
            error: {
              message: error.message,
              source: 'custom',
            },
          })
        }
      )
      eventRateLimiters.set(eventType, limiter)
    }
    return limiter
  }

  const subscription = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (rawEvent: RawRumEvent) => {
    const rateLimiter = getOrCreateRateLimiter(rawEvent.type)
    if (rateLimiter.isLimitReached()) {
      return
    }

    const session = sessionManager.findTrackedSession() || sessionManager.renew()
    const page = getCurrentPage()
    const rawView = 'view' in rawEvent ? (rawEvent as Record<string, any>).view : undefined
    const rumEvent: RumEvent = {
      ...rawEvent,
      application: { id: configuration.applicationId },
      session: { id: session.id },
      view: {
        ...rawView,
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
    stop: () => {
      subscription.unsubscribe()
      eventRateLimiters.forEach((limiter) => limiter.stop())
      eventRateLimiters.clear()
    },
  }
}
