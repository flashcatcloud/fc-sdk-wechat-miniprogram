import type { PlatformAdapter } from '@flashcatcloud/miniprogram-platform'
import type { ContextManager, SessionManager } from '@flashcatcloud/miniprogram-core'
import type { EventRateLimiter } from '@flashcatcloud/miniprogram-core'
import { createEventRateLimiter, generateUUID } from '@flashcatcloud/miniprogram-core'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { RawRumEvent, RumEventType } from '../rawRumEvent.types'
import type { RumConfiguration } from './configuration/configuration'
import type { RumEvent, Connectivity } from '../rumEvent.types'
import type { PageHistoryEntry } from './contexts/pageHistory'

function startConnectivityMonitor(adapter: PlatformAdapter): { getConnectivity: () => Connectivity } {
  let currentConnectivity: Connectivity = {
    status: 'connected',
    interfaces: undefined,
    effective_type: undefined,
  }

  try {
    adapter.getNetworkType({
      success(res) {
        currentConnectivity = mapNetworkType(res.networkType)
      },
    })
  } catch (_e) {
    // ignore
  }

  try {
    adapter.onNetworkStatusChange((res) => {
      currentConnectivity = {
        status: res.isConnected ? 'connected' : 'not_connected',
        ...mapNetworkTypeFields(res.networkType),
      }
    })
  } catch (_e) {
    // ignore
  }

  return {
    getConnectivity: () => currentConnectivity,
  }
}

function mapNetworkType(networkType: string): Connectivity {
  return {
    status: networkType === 'none' ? 'not_connected' : 'connected',
    ...mapNetworkTypeFields(networkType),
  }
}

function mapNetworkTypeFields(networkType: string): Pick<Connectivity, 'interfaces' | 'effective_type'> {
  switch (networkType) {
    case 'wifi':
      return { interfaces: ['wifi'], effective_type: undefined }
    case '2g':
      return { interfaces: ['cellular'], effective_type: '2g' }
    case '3g':
      return { interfaces: ['cellular'], effective_type: '3g' }
    case '4g':
      return { interfaces: ['cellular'], effective_type: '4g' }
    case '5g':
      return { interfaces: ['cellular'], effective_type: undefined }
    case 'none':
      return { interfaces: ['none'], effective_type: undefined }
    default:
      return { interfaces: ['unknown'], effective_type: undefined }
  }
}

function isEmptyObject(object: Record<string, unknown>) {
  return Object.keys(object).length === 0
}

export function startRumAssembly({
  lifeCycle,
  configuration,
  sessionManager,
  globalContext,
  userContext,
  getCurrentPage,
  findPage,
  adapter,
}: {
  lifeCycle: LifeCycle
  configuration: RumConfiguration
  sessionManager: SessionManager
  globalContext: ContextManager
  userContext: ContextManager
  getCurrentPage: () => PageHistoryEntry | undefined
  findPage?: (time: number) => PageHistoryEntry | undefined
  adapter: PlatformAdapter
}) {
  const eventRateLimiters = new Map<RumEventType, EventRateLimiter>()
  const connectivityMonitor = startConnectivityMonitor(adapter)

  function getOrCreateRateLimiter(eventType: RumEventType): EventRateLimiter {
    let limiter = eventRateLimiters.get(eventType)
    if (!limiter) {
      limiter = createEventRateLimiter(eventType, configuration.eventRateLimiterThreshold, (error) => {
        lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
          date: Date.now(),
          type: 'error',
          error: {
            id: generateUUID(),
            message: error.message,
            source: 'custom',
          },
        })
      })
      eventRateLimiters.set(eventType, limiter)
    }
    return limiter
  }

  const subscription = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (rawEvent: RawRumEvent) => {
    const rateLimiter = getOrCreateRateLimiter(rawEvent.type)
    if (rateLimiter.isLimitReached()) {
      return
    }

    const eventTime = rawEvent.date
    const currentPage = getCurrentPage()
    const rawView = 'view' in rawEvent ? (rawEvent as Record<string, any>).view : undefined
    // Current view events keep the existing renewal boundary behavior: a missing current session creates a new view.
    // Historical view updates and non-view events use event time so delayed work stays aligned with its original context.
    const shouldUseEventTimeForSession = rawEvent.type !== 'view' || (rawView?.id && rawView.id !== currentPage?.id)
    let session = sessionManager.findSession(shouldUseEventTimeForSession ? eventTime : undefined)
    if (!session) {
      session = sessionManager.renew()
      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED, { session })
      if (session.isTracked === false) {
        return
      }
      if (rawEvent.type === 'view') {
        return
      }
    }
    sessionManager.expand()
    // A sampled-out session is still a valid session. Keep it alive until it
    // expires, but never emit its events or perform another sampling draw.
    if (session.isTracked === false) {
      return
    }
    const page = findPage?.(eventTime) || currentPage
    const pageName = page?.name || 'unknown'
    const usr = userContext.getContext()
    if (session.anonymousId && !usr.anonymous_id && configuration.trackAnonymousUser) {
      if (isEmptyObject(usr)) {
        usr.id = session.anonymousId
      }
      usr.anonymous_id = session.anonymousId
    }

    const lockedRawEvent: RawRumEvent = rawEvent.type === 'view'
      ? {
          ...rawEvent,
          _dd: {
            ...rawEvent._dd,
            configuration: {
              ...rawEvent._dd.configuration,
              session_sample_rate: session.sessionSampleRate ?? configuration.sessionSampleRate,
              rc_version: session.rcVersion ?? 0,
            },
          },
        }
      : rawEvent

    const rumEvent: RumEvent = {
      ...lockedRawEvent,
      service: configuration.service,
      version: configuration.version,
      application: { id: configuration.applicationId },
      session: {
        id: session.id,
        type: 'user',
        has_replay: false,
        sampled_for_replay: false,
      },
      view: {
        ...rawView,
        id: rawView?.id || page?.id || 'unknown',
        url: rawView?.url || pageName,
        name: rawView?.name || pageName,
      },
      connectivity: connectivityMonitor.getConnectivity(),
      context: globalContext.getContext(),
      source: 'miniprogram',
    }
    if (!isEmptyObject(usr)) {
      rumEvent.usr = usr as RumEvent['usr']
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
