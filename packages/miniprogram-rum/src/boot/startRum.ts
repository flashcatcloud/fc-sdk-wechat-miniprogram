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

export function startRum(configuration: RumConfiguration, adapter: PlatformAdapter) {
  const lifeCycle = new LifeCycle()

  const sessionManager = startRumSessionManager(adapter)
  if (!sessionManager.findTrackedSession()) {
    sessionManager.renew()
  }

  if (configuration.debug) {
    console.log('[FlashCat RUM] 🔧 启动监控功能', {
      trackPages: configuration.trackPages,
      trackActions: configuration.trackActions,
      trackRequests: configuration.trackRequests,
      trackErrors: configuration.trackErrors,
      trackPerformance: configuration.trackPerformance,
    })
  }

  const { pageObservable, actionObservable } = initPageObservable()
  const { observable: requestObservable } = initRequestObservable(adapter)
  const { errorObservable, unhandledRejectionObservable } = initAppObservable(adapter)

  const pageCollection = startPageCollection(lifeCycle, pageObservable)
  const requestCollection = configuration.trackRequests ? startRequestCollection(lifeCycle, requestObservable) : undefined
  const actionCollection = configuration.trackActions ? startActionCollection(lifeCycle, actionObservable) : undefined
  const performanceCollection = configuration.trackPerformance
    ? startPerformanceCollection(lifeCycle, pageObservable)
    : undefined

  const errorCollection = startErrorCollection(lifeCycle)
  if (configuration.trackErrors) {
    errorObservable.subscribe((event) => {
      if (configuration.debug) {
        console.log('[FlashCat RUM] ⚠️ 捕获到 App 错误', event.message)
      }
      errorCollection.addError(event.message, 'app')
    })
    unhandledRejectionObservable.subscribe((event) => {
      if (configuration.debug) {
        console.log('[FlashCat RUM] ⚠️ 捕获到未处理的 Promise 拒绝', event.reason)
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
  })

  const rumBatch = startRumBatch(configuration, lifeCycle, adapter)

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
      lifeCycle.notify(LifeCycleEventType.CUSTOM_EVENT_COLLECTED, { name, context, time })
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: time,
        type: 'custom',
        event: { name, context },
      })
    },
    addTiming: (name: string, value?: number) => {
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_COLLECTED, { name, value: value ?? 0, time: Date.now() })
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: Date.now(),
        type: 'performance',
        performance: { name, value: value ?? 0 },
      })
    },
    stop: () => {
      rumBatch.stop()
      rumAssembly.stop()
      requestCollection?.stop()
      actionCollection?.stop()
      performanceCollection?.stop()
      pageCollection.stop()
    },
  }
}
