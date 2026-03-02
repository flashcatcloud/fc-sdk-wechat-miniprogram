import type { ContextManager, SessionManager } from '@flashcatcloud/miniprogram-core'
import type { EventRateLimiter } from '@flashcatcloud/miniprogram-core'
import { createEventRateLimiter } from '@flashcatcloud/miniprogram-core'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { RawRumEvent, RumEventType } from '../rawRumEvent.types'
import type { RumConfiguration } from './configuration/configuration'
import type { RumEvent, Connectivity } from '../rumEvent.types'
import type { PageHistoryEntry } from './contexts/pageHistory'

function getWxConnectivity(): Connectivity {
  const connectivity: Connectivity = {
    status: 'connected',
    interfaces: undefined,
    effective_type: undefined,
  }

  try {
    const systemInfo = wx.getSystemInfoSync()
    if (systemInfo) {
      // @ts-ignore - platform field exists at runtime
      const platform = systemInfo.platform
      if (platform) {
        connectivity.interfaces = [platform === 'ios' || platform === 'android' ? 'cellular' : 'other']
      }
    }
  } catch (_e) {
    // ignore
  }

  return connectivity
}

function startConnectivityMonitor(): { getConnectivity: () => Connectivity } {
  let currentConnectivity = getWxConnectivity()

  try {
    wx.getNetworkType({
      success(res: { networkType: string }) {
        currentConnectivity = mapNetworkType(res.networkType)
      },
    })
  } catch (_e) {
    // ignore
  }

  try {
    wx.onNetworkStatusChange((res: { isConnected: boolean; networkType: string }) => {
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
  const connectivityMonitor = startConnectivityMonitor()

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
    const pageName = page?.name || 'unknown'
    const rumEvent: RumEvent = {
      ...rawEvent,
      application: { id: configuration.applicationId },
      session: {
        id: session.id,
        type: 'user',
        has_replay: false,
        sampled_for_replay: false,
      },
      view: {
        ...rawView,
        id: page?.id || 'unknown',
        url: pageName,
        name: pageName,
      },
      connectivity: connectivityMonitor.getConnectivity(),
      user: userContext.getContext(),
      context: globalContext.getContext(),
      source: 'miniprogram',
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
