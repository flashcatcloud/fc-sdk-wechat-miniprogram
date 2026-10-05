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
import { startSessionErrorTracking } from '../domain/trackSessionError'

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
  remoteConfigurationController.setSamplingChangeHandler((_previous, next) => {
    const session = sessionManager.findSession()
    // A forced session is collected whatever the rates say, so no rate may end it.
    if (!session || session.isForced === true) {
      return
    }
    // Ending the session is the only action: the next event creates one against the newly
    // committed configuration. Nothing else interrupts a live session, whose draw is locked.
    if (session.isTracked === false) {
      // A session drawn at 0 lost no lottery: nothing was ever drawn for it. A rate leaving 0, or the
      // on-error switch turning on at 0, would now keep some of these visitors, so they draw again.
      // A session that lost a draw at a real rate keeps its outcome, or the fleet would be re-rolled.
      if (session.sessionSampleRate === 0 && (next.sessionSampleRate > 0 || next.sessionOnError)) {
        sessionManager.expire()
      }
      return
    }
    // A rate of 0 is the emergency stop, except for a session kept by the on-error switch while the
    // switch stays on: rate 0 next to the switch is its ordinary setting, and ending such a session
    // would throw away exactly the minute the switch exists to keep.
    if (next.sessionSampleRate === 0 && !(next.sessionOnError && session.sampledOnError === true)) {
      sessionManager.expire()
    }
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

  // Subscribed before the batch below, and it has to stay that way: the withheld event buffer runs
  // on the same event and only sees a session as released once this has released it.
  const sessionErrorTrackingSubscription = startSessionErrorTracking(lifeCycle, sessionManager)
  const rumBatch = startRumBatch(configuration, lifeCycle, adapter, appObservable, sessionManager)

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
    setForcedSession: () => {
      sessionManager.setForcedSession()
      // A session that withholds its events until it errors is released straight away: the host
      // asked for this user now. Its draw still stands; only the next session is forced. Announced
      // whether or not this is what released it: a release an error already scheduled is still
      // waiting on its jitter, and the host asked for it now.
      const session = sessionManager.findSession()
      if (session) {
        sessionManager.release(session.id)
        lifeCycle.notify(LifeCycleEventType.SESSION_RELEASED, { sessionId: session.id, reason: 'force' })
      }
    },
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
      sessionErrorTrackingSubscription.unsubscribe()
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
