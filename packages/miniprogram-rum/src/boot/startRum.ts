import type { PlatformAdapter } from '@flashcatcloud/miniprogram-platform'
import { initAppObservable, initPageObservable, initRequestObservable } from '@flashcatcloud/miniprogram-platform'
import { LifeCycle } from '../domain/lifeCycle'
import type { RumConfiguration } from '../domain/configuration/configuration'
import { startRumSessionManager } from '../domain/rumSessionManager'
import { startPageCollection } from '../domain/page/pageCollection'
import { startRequestCollection } from '../domain/request/requestCollection'
import { startErrorCollection } from '../domain/error/errorCollection'
import { startActionCollection } from '../domain/action/actionCollection'
import { startPerformanceCollection } from '../domain/performance/performanceCollection'
import { startGlobalContext } from '../domain/contexts/globalContext'
import { startUserContext } from '../domain/contexts/userContext'
import { startRumAssembly } from '../domain/assembly'
import { startRumBatch } from '../transport/startRumBatch'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { PageCollection } from '../domain/page/pageCollection'

const noopPageCollection: PageCollection = {
  stop: () => undefined,
  getCurrentPage: () => undefined,
  startManualPage: () => undefined,
}

export function startRum(configuration: RumConfiguration, adapter: PlatformAdapter) {
  const lifeCycle = new LifeCycle()

  const sessionManager = startRumSessionManager(adapter)
  if (!sessionManager.findTrackedSession()) {
    sessionManager.renew()
  }

  if (configuration.debug) {
    console.log('[FlashCat RUM] Starting monitoring', {
      trackPages: configuration.trackPages,
      trackActions: configuration.trackActions,
      trackRequests: configuration.trackRequests,
      trackErrors: configuration.trackErrors,
      trackPerformance: configuration.trackPerformance,
      tracing: configuration.tracing.enabled
        ? {
            enabled: configuration.tracing.enabled,
            sampleRate: configuration.tracing.sampleRate,
          }
        : 'disabled',
    })
  }

  const { pageObservable, actionObservable, setDataObservable, stop: stopPageObservable } = initPageObservable()
  const { observable: requestObservable, requestStartObservable, stop: stopRequestObservable } = initRequestObservable(adapter, configuration.tracing)
  const { appObservable, errorObservable, unhandledRejectionObservable, stop: stopAppObservable } = initAppObservable(adapter)

  requestStartObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, event)
  })
  setDataObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.PAGE_SETDATA_COLLECTED, event)
  })

  const pageCollection = configuration.trackPages
    ? startPageCollection(lifeCycle, pageObservable, configuration)
    : noopPageCollection
  const requestCollection = configuration.trackRequests
    ? startRequestCollection(lifeCycle, requestObservable)
    : undefined
  const actionCollection = configuration.trackActions ? startActionCollection(lifeCycle, actionObservable) : undefined
  const performanceCollection = configuration.trackPerformance
    ? startPerformanceCollection(lifeCycle, pageObservable)
    : undefined

  const errorCollection = startErrorCollection(lifeCycle)
  if (configuration.trackErrors) {
    errorObservable.subscribe((event) => {
      if (configuration.debug) {
        console.log('[FlashCat RUM] Captured app error', event.message)
      }
      errorCollection.addError(event.message, 'app')
    })
    unhandledRejectionObservable.subscribe((event) => {
      if (configuration.debug) {
        console.log('[FlashCat RUM] Captured unhandled promise rejection', event.reason)
      }
      errorCollection.addError(event.reason, 'promise')
    })
  }

  const globalContext = startGlobalContext()
  const userContext = startUserContext()

  const rumAssembly = startRumAssembly({
    lifeCycle,
    configuration,
    sessionManager,
    globalContext,
    userContext,
    getCurrentPage: pageCollection.getCurrentPage,
    adapter,
  })

  const rumBatch = startRumBatch(configuration, lifeCycle, adapter, appObservable)

  return {
    lifeCycle,
    sessionManager,
    globalContext,
    userContext,
    addAction: actionCollection?.addAction || (() => undefined),
    addError: errorCollection.addError,
    startPage: (name?: string) => {
      if (!name) {
        return
      }
      pageCollection.startManualPage(name)
    },
    addCustomEvent: (name: string, context?: Record<string, unknown>) => {
      const time = Date.now()
      lifeCycle.notify(LifeCycleEventType.CUSTOM_EVENT_COLLECTED, {
        name,
        context,
        time,
      })
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: time,
        type: 'custom',
        event: { name, context },
      })
    },
    addTiming: (name: string, time?: number) => {
      lifeCycle.notify(LifeCycleEventType.CUSTOM_TIMING_COLLECTED, {
        name,
        time,
        now: Date.now(),
      })
    },
    stop: () => {
      stopAppObservable()
      stopPageObservable()
      stopRequestObservable()
      rumBatch.stop()
      rumAssembly.stop()
      requestCollection?.stop()
      actionCollection?.stop()
      performanceCollection?.stop()
      pageCollection.stop()
    },
  }
}
