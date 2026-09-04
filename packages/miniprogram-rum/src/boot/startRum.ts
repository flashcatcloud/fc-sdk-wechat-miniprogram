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
import { generateUUID } from '@flashcatcloud/miniprogram-core'
import type { PageCollection } from '../domain/page/pageCollection'
import { createRemoteConfigurationController } from '../domain/configuration/remoteConfiguration'

const noopPageCollection: PageCollection = {
  stop: () => undefined,
  getCurrentPage: () => undefined,
  findPage: () => undefined,
  startManualPage: () => undefined,
}

export function startRum(configuration: RumConfiguration, adapter: PlatformAdapter) {
  const lifeCycle = new LifeCycle()

  const remoteConfigurationController = createRemoteConfigurationController(adapter, configuration)
  const sessionManager = startRumSessionManager(
    adapter,
    configuration,
    remoteConfigurationController.getSessionConfiguration,
  )
  if (!sessionManager.findSession()) {
    sessionManager.renew()
  }
  remoteConfigurationController.setSessionSampleRateChangeHandler(() => {
    const currentSession = sessionManager.findSession()
    if (!currentSession || currentSession.isForced === true) {
      return
    }
    // Crossing the zero boundary is the only remote update that interrupts a live session.
    // The next event creates a session against the newly committed configuration.
    sessionManager.expire()
  })

  if (configuration.debug) {
    console.log('[FlashCat RUM][Debug] RUM monitoring started', {
      sessionSampleRate: sessionManager.findSession()?.sessionSampleRate,
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
  const {
    appObservable,
    errorObservable,
    unhandledRejectionObservable,
    pageNotFoundObservable,
    lazyLoadErrorObservable,
    stop: stopAppObservable,
  } = initAppObservable(adapter)

  requestStartObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, event)
  })
  setDataObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.PAGE_SETDATA_COLLECTED, event)
  })

  const pageCollection = configuration.trackPages
    ? startPageCollection(
        lifeCycle,
        pageObservable,
        configuration,
        appObservable,
        () => sessionManager.findSession()?.isTracked !== false,
      )
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
        console.log('[FlashCat RUM][Debug] App error captured', event.message)
      }
      errorCollection.addError(event.message, 'app')
    })
    unhandledRejectionObservable.subscribe((event) => {
      if (configuration.debug) {
        console.log('[FlashCat RUM][Debug] Unhandled promise rejection captured', event.reason)
      }
      errorCollection.addError(event.reason, 'promise')
    })
    pageNotFoundObservable.subscribe((event) => {
      if (configuration.debug) {
        console.log('[FlashCat RUM][Debug] Page not found captured', event.path)
      }
      errorCollection.addError(`Page not found: ${event.path}`, 'page-not-found')
    })
    lazyLoadErrorObservable.subscribe((event) => {
      if (configuration.debug) {
        console.log('[FlashCat RUM][Debug] Lazy load error captured', event)
      }
      const subpackageDesc = event.subpackage?.map((p) => p.root || p.name).filter(Boolean).join(',') || ''
      const message = `Lazy load failed (${event.type})${subpackageDesc ? `: ${subpackageDesc}` : ''}${event.errMsg ? ` - ${event.errMsg}` : ''}`
      errorCollection.addError(message, 'lazy-load')
    })
    requestObservable.subscribe((event) => {
      if (!event.errorMessage) {
        return
      }
      if (configuration.debug) {
        console.log('[FlashCat RUM][Debug] Network error captured', event.url, event.errorMessage)
      }
      errorCollection.addError(`${event.method} ${event.url} failed: ${event.errorMessage}`, 'network')
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
    findPage: pageCollection.findPage,
    adapter,
  })

  const rumBatch = startRumBatch(configuration, lifeCycle, adapter, appObservable)

  // Fetch on the next microtask so public initialization can complete first.
  // The request is marked as internal and never blocks event collection.
  const appliedVersion = sessionManager.findSession()?.rcVersion
  void Promise.resolve().then(() => remoteConfigurationController.fetch(appliedVersion))

  // ...and again whenever a session is renewed. A miniprogram process routinely outlives a session,
  // so a launch-only fetch would leave every later session on stale configuration. Positive-rate
  // changes apply to a later session; crossing zero expires the current non-forced session after
  // the response is committed. The controller ignores a call while a request chain is active.
  const remoteConfigRenewalSubscription = lifeCycle.subscribe(
    LifeCycleEventType.SESSION_RENEWED,
    ({ session }) => remoteConfigurationController.fetch(session.rcVersion),
  )

  return {
    lifeCycle,
    sessionManager,
    getRemoteConfig: remoteConfigurationController.getRemoteConfig,
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
        event: { id: generateUUID(), name, context },
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
      remoteConfigRenewalSubscription.unsubscribe()
      remoteConfigurationController.stop()
      requestCollection?.stop()
      actionCollection?.stop()
      performanceCollection?.stop()
      pageCollection.stop()
    },
  }
}
