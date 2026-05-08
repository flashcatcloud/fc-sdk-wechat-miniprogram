import type { Observable } from '@flashcatcloud/miniprogram-core'
import type { AppEvent, PageEvent } from '@flashcatcloud/miniprogram-platform'
import { createValueHistory, generateUUID, toServerDuration } from '@flashcatcloud/miniprogram-core'
import { LifeCycleEventType } from '../lifeCycle'
import type { LifeCycle } from '../lifeCycle'
import type { PageHistoryEntry } from '../contexts/pageHistory'
import { PageContextManager } from '../contexts/pageContextManager'
import { EventCountsTracker } from '../contexts/eventCountsTracker'
import type { RawRumViewEvent } from '../../rawRumEvent.types'
import type { RumConfiguration } from '../configuration/configuration'

export interface PageCollection {
  stop: () => void
  getCurrentPage: () => PageHistoryEntry | undefined
  findPage: (time: number) => PageHistoryEntry | undefined
  startManualPage: (name: string) => void
}

const PAGE_UPDATE_INTERVAL = 3000
const PAGE_HISTORY_EXPIRE_DELAY = 4 * 60 * 60 * 1000
const PAGE_HISTORY_MAX_ENTRIES = 1024
export function startPageCollection(
  lifeCycle: LifeCycle,
  pageObservable: Observable<PageEvent>,
  configuration: RumConfiguration,
  appObservable?: Observable<AppEvent>,
) {
  let currentPage: PageHistoryEntry | undefined
  const pageHistory = createValueHistory<PageHistoryEntry>(() => Date.now(), {
    expireDelay: PAGE_HISTORY_EXPIRE_DELAY,
    maxEntries: PAGE_HISTORY_MAX_ENTRIES,
  })
  const pageContextManager = new PageContextManager()
  const eventCountsTracker = new EventCountsTracker(lifeCycle, (event) => pageHistory.find(event.date)?.value, (page) => {
    if (page === currentPage && page.updateIntervalId) {
      return
    }
    page.documentVersion = (page.documentVersion || 0) + 1
    emitViewUpdate(page)
  })

  function setCurrentPage(page: PageHistoryEntry) {
    currentPage = page
    pageHistory.add(page, page.startTime)
  }

  function buildPageEventData(
    page: PageHistoryEntry,
    overrides: Partial<RawRumViewEvent['view']> = {},
  ): RawRumViewEvent['view'] {
    const counts = eventCountsTracker.getCounts(page.id)
    return {
      id: page.id,
      url: page.name,
      name: page.name,
      referrer: page.referrer,
      loading_type: page.loadingType,
      // Active is the default state for an open page and can be overridden by persisted metrics on hide/unload.
      is_active: true,
      ...(page.metrics || {}),
      action: { count: counts.actionCount },
      error: { count: counts.errorCount },
      resource: { count: counts.resourceCount },
      ...overrides,
    }
  }

  function buildDdData(page: PageHistoryEntry): RawRumViewEvent['_dd'] {
    return {
      document_version: page.documentVersion,
      format_version: 2,
      page_states: page.pageStates,
      configuration: {
        session_sample_rate: configuration.sessionSampleRate,
        session_replay_sample_rate: 0,
        start_session_replay_recording_manually: false,
      },
    }
  }

  function emitViewUpdate(page: PageHistoryEntry, overrides: Partial<RawRumViewEvent['view']> = {}) {
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: page.startTime,
      type: 'view',
      _dd: buildDdData(page),
      view: buildPageEventData(page, overrides),
    })
  }

  function mergeViewMetrics(page: PageHistoryEntry, metrics: Partial<RawRumViewEvent['view']>) {
    const nextMetrics: Partial<RawRumViewEvent['view']> = { ...(page.metrics || {}) }

    const setMetricIfDefined = <
      K extends
        | 'app_launch'
        | 'first_render'
        | 'loading_time'
        | 'time_spent'
        | 'is_active'
        | 'onload_to_onshow'
        | 'onshow_to_onready',
    >(
      key: K,
    ) => {
      const value = metrics[key]
      if (value !== undefined) {
        nextMetrics[key] = value
      }
    }
    setMetricIfDefined('app_launch')
    setMetricIfDefined('first_render')
    setMetricIfDefined('loading_time')
    setMetricIfDefined('time_spent')
    setMetricIfDefined('is_active')
    setMetricIfDefined('onload_to_onshow')
    setMetricIfDefined('onshow_to_onready')

    if (metrics.evaluate_script !== undefined) {
      nextMetrics.evaluate_script = (nextMetrics.evaluate_script ?? 0) + metrics.evaluate_script
    }
    if (metrics.first_render_detail) {
      nextMetrics.first_render_detail = {
        ...(nextMetrics.first_render_detail || {}),
        ...metrics.first_render_detail,
      }
    }
    if (metrics.performance) {
      nextMetrics.performance = {
        ...(nextMetrics.performance || {}),
        ...metrics.performance,
      }
    }
    if (metrics.custom_timings) {
      nextMetrics.custom_timings = {
        ...(nextMetrics.custom_timings || {}),
        ...metrics.custom_timings,
      }
    }
    if (metrics.setdata) {
      const currentSetData = nextMetrics.setdata
      const incomingSetData = metrics.setdata
      const nextSetDataDuration =
        currentSetData?.duration !== undefined || incomingSetData.duration !== undefined
          ? (currentSetData?.duration ?? 0) + (incomingSetData.duration ?? 0)
          : undefined
      nextMetrics.setdata = {
        count: (currentSetData?.count ?? 0) + (incomingSetData.count ?? 0),
        duration: nextSetDataDuration,
      }
    }

    page.metrics = nextMetrics
  }

  function schedulePageUpdate(page: PageHistoryEntry) {
    return setInterval(() => {
      if (!page) {
        return
      }
      mergeViewMetrics(page, {
        time_spent: toServerDuration(getForegroundDuration(page)),
      })
      page.documentVersion = (page.documentVersion || 0) + 1
      emitViewUpdate(page)
    }, PAGE_UPDATE_INTERVAL)
  }

  function stopPageUpdate(page: PageHistoryEntry | undefined) {
    if (page?.updateIntervalId) {
      clearInterval(page.updateIntervalId)
      page.updateIntervalId = undefined
    }
  }

  function addPageState(page: PageHistoryEntry, state: string, time: number) {
    if (!page.pageStates) {
      page.pageStates = []
    }
    if (page.pageStates[page.pageStates.length - 1]?.state === state) {
      return
    }
    page.pageStates.push({
      state,
      start: toServerDuration(time - page.startTime),
    })
  }

  function getForegroundDuration(page: PageHistoryEntry, time = Date.now()) {
    return (page.foregroundDuration ?? 0) + (page.foregroundStartTime !== undefined ? time - page.foregroundStartTime : 0)
  }

  function pauseForeground(page: PageHistoryEntry, time: number) {
    if (page.foregroundStartTime === undefined) {
      return
    }
    page.foregroundDuration = (page.foregroundDuration ?? 0) + time - page.foregroundStartTime
    page.foregroundStartTime = undefined
  }

  function resumeForeground(page: PageHistoryEntry, time: number) {
    if (page.foregroundStartTime === undefined) {
      page.foregroundStartTime = time
    }
  }

  function emitPageHidden(page: PageHistoryEntry, time: number, state: 'hidden' | 'terminated') {
    if (state === 'hidden' && page.foregroundStartTime === undefined) {
      return
    }
    stopPageUpdate(page)
    pauseForeground(page, time)
    addPageState(page, state, time)
    mergeViewMetrics(page, {
      time_spent: toServerDuration(getForegroundDuration(page, time)),
      is_active: false,
    })
    page.documentVersion = (page.documentVersion || 0) + 1
    emitViewUpdate(page)
  }

  function emitPageShown(page: PageHistoryEntry, time: number) {
    if (page.updateIntervalId || page.foregroundStartTime !== undefined) {
      return
    }
    addPageState(page, 'active', time)
    mergeViewMetrics(page, {
      time_spent: toServerDuration(getForegroundDuration(page, time)),
      is_active: true,
    })
    page.documentVersion = (page.documentVersion || 0) + 1
    emitViewUpdate(page)
    resumeForeground(page, time)
    page.updateIntervalId = schedulePageUpdate(page)
  }

  const performanceSubscription = lifeCycle.subscribe(
    LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
    ({ route, metrics }) => {
      if (!currentPage) {
        return
      }
      if (route && route !== currentPage.name) {
        return
      }
      mergeViewMetrics(currentPage, metrics)
      currentPage.documentVersion = (currentPage.documentVersion || 0) + 1
      emitViewUpdate(currentPage)
    },
  )

  const timingSubscription = lifeCycle.subscribe(LifeCycleEventType.CUSTOM_TIMING_COLLECTED, ({ name, time, now }) => {
    if (!currentPage) {
      return
    }
    const relativeDuration = (time ?? now) - currentPage.startTime
    if (relativeDuration < 0) {
      return
    }
    const sanitizedName = name.replace(/[^a-zA-Z0-9\-_.@$]/g, '_')
    mergeViewMetrics(currentPage, {
      custom_timings: {
        [sanitizedName]: toServerDuration(relativeDuration) ?? 0,
      },
    })
    currentPage.documentVersion = (currentPage.documentVersion || 0) + 1
    emitViewUpdate(currentPage)
  })

  const setDataSubscription = lifeCycle.subscribe(LifeCycleEventType.PAGE_SETDATA_COLLECTED, ({ route, duration }) => {
    if (!currentPage || route !== currentPage.name) {
      return
    }
    mergeViewMetrics(currentPage, {
      setdata: {
        count: 1,
        duration: toServerDuration(duration),
      },
    })
    currentPage.documentVersion = (currentPage.documentVersion || 0) + 1
    emitViewUpdate(currentPage)
  })

  const sessionRenewedSubscription = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, ({ session }) => {
    if (!currentPage || session.created <= currentPage.startTime) {
      return
    }
    const previousPage = currentPage
    stopPageUpdate(previousPage)

    const renewedPage: PageHistoryEntry = {
      id: generateUUID(),
      name: previousPage.name,
      startTime: session.created,
      referrer: previousPage.referrer,
      loadingType: previousPage.loadingType,
      documentVersion: 0,
      foregroundStartTime: session.created,
      foregroundDuration: 0,
    }
    setCurrentPage(renewedPage)

    if (session.created - previousPage.startTime < PAGE_HISTORY_EXPIRE_DELAY) {
      emitPageHidden(previousPage, session.created, 'terminated')
    }
    emitViewUpdate(renewedPage)
    renewedPage.updateIntervalId = schedulePageUpdate(renewedPage)
  })

  const pageSubscription = pageObservable.subscribe((event) => {
    if (event.lifecycle === 'load') {
      stopPageUpdate(currentPage)
      pageContextManager.resetIfNeeded()

      const loadPage: PageHistoryEntry = {
        id: generateUUID(),
        name: event.route || 'unknown',
        startTime: event.time,
        loadTime: event.time,
        referrer: pageContextManager.getReferrer(),
        loadingType: pageContextManager.getLoadingType(),
        documentVersion: 0,
        foregroundStartTime: event.time,
        foregroundDuration: 0,
      }
      setCurrentPage(loadPage)

      lifeCycle.notify(LifeCycleEventType.PAGE_EVENT, event)
      emitViewUpdate(loadPage)
      loadPage.updateIntervalId = schedulePageUpdate(loadPage)
      return
    }

    if (event.lifecycle === 'show' && currentPage && currentPage.showTime === undefined) {
      currentPage.showTime = event.time
      if (currentPage.loadTime !== undefined) {
        mergeViewMetrics(currentPage, {
          onload_to_onshow: toServerDuration(event.time - currentPage.loadTime),
        })
      }
      // Defer the emit until ready so the first-show lifecycle metrics are reported together.
      return
    }

    if (event.lifecycle === 'ready' && currentPage && currentPage.loadTime) {
      mergeViewMetrics(currentPage, {
        loading_time: toServerDuration(event.time - currentPage.loadTime),
        onshow_to_onready:
          currentPage.showTime !== undefined ? toServerDuration(event.time - currentPage.showTime) : undefined,
      })
      currentPage.documentVersion = (currentPage.documentVersion || 0) + 1
      emitViewUpdate(currentPage)
      return
    }

    if (event.lifecycle === 'show' && !currentPage) {
      stopPageUpdate(currentPage)
      pageContextManager.resetIfNeeded()

      const showPage: PageHistoryEntry = {
        id: generateUUID(),
        name: event.route || 'unknown',
        startTime: event.time,
        showTime: event.time,
        referrer: pageContextManager.getReferrer(),
        loadingType: pageContextManager.getLoadingType(),
        documentVersion: 0,
        foregroundStartTime: event.time,
        foregroundDuration: 0,
      }
      setCurrentPage(showPage)

      lifeCycle.notify(LifeCycleEventType.PAGE_EVENT, event)
      emitViewUpdate(showPage)
      showPage.updateIntervalId = schedulePageUpdate(showPage)
      return
    }

    if (event.lifecycle === 'show' && currentPage && !currentPage.updateIntervalId) {
      emitPageShown(currentPage, event.time)
      return
    }

    if (event.lifecycle === 'hide' && currentPage) {
      emitPageHidden(currentPage, event.time, 'hidden')
      return
    }

    if (event.lifecycle === 'unload' && currentPage) {
      emitPageHidden(currentPage, event.time, 'terminated')
      pageHistory.closeActive(event.time)
      currentPage = undefined
    }
  })

  const appSubscription = appObservable?.subscribe((event) => {
    if (!currentPage) {
      return
    }
    if (event.lifecycle === 'hide') {
      emitPageHidden(currentPage, event.time, 'hidden')
      return
    }
    if (event.lifecycle === 'show' && !currentPage.updateIntervalId) {
      emitPageShown(currentPage, event.time)
    }
  })

  return {
    stop: () => {
      stopPageUpdate(currentPage)
      eventCountsTracker.stop()
      performanceSubscription.unsubscribe()
      timingSubscription.unsubscribe()
      setDataSubscription.unsubscribe()
      sessionRenewedSubscription.unsubscribe()
      pageSubscription.unsubscribe()
      appSubscription?.unsubscribe()
      pageHistory.stop()
    },
    getCurrentPage: () => currentPage,
    findPage: (time: number) => pageHistory.find(time)?.value,
    startManualPage: (name: string) => {
      const startTime = Date.now()
      const previousPage = currentPage
      stopPageUpdate(previousPage)
      pageContextManager.resetIfNeeded()

      const manualPage: PageHistoryEntry = {
        id: generateUUID(),
        name,
        startTime,
        referrer: pageContextManager.getReferrer(),
        loadingType: pageContextManager.getLoadingType(),
        documentVersion: 0,
        foregroundStartTime: startTime,
        foregroundDuration: 0,
      }
      setCurrentPage(manualPage)

      if (previousPage) {
        emitPageHidden(previousPage, startTime, 'terminated')
      }
      emitViewUpdate(manualPage)
      manualPage.updateIntervalId = schedulePageUpdate(manualPage)
    },
  }
}
