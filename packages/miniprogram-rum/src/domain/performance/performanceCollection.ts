import { toServerDuration, type Observable } from '@flashcatcloud/miniprogram-core'
import type { PageEvent } from '@flashcatcloud/miniprogram-platform'
import type { RawRumViewEvent } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

interface MiniProgramPerformanceEntry {
  entryType: string
  name: string
  startTime: number
  duration?: number
  path?: string
  moduleName?: string
  viewLayerReadyTime?: number
  initDataSendTime?: number
  initDataRecvTime?: number
  viewLayerRenderStartTime?: number
  viewLayerRenderEndTime?: number
}

interface MiniProgramPerformanceObserver {
  observe: (options: { entryTypes: string[] }) => void
  disconnect: () => void
}

interface MiniProgramPerformance {
  createObserver: (
    callback: (entryList: { getEntries: () => MiniProgramPerformanceEntry[] }) => void,
  ) => MiniProgramPerformanceObserver
}

declare const wx: {
  getPerformance?: () => MiniProgramPerformance
}

function toRelativeTimestamp(currentTimestamp: number | undefined, baseTimestamp: number | undefined) {
  if (currentTimestamp === undefined) {
    return undefined
  }
  if (baseTimestamp === undefined || currentTimestamp < baseTimestamp) {
    return toServerDuration(currentTimestamp)
  }
  return toServerDuration(currentTimestamp - baseTimestamp)
}

function buildFirstRenderDetail(
  entry: MiniProgramPerformanceEntry,
): RawRumViewEvent['view']['first_render_detail'] | undefined {
  const detail = {
    view_layer_ready_time: toRelativeTimestamp(entry.viewLayerReadyTime, entry.startTime),
    init_data_send_time: toRelativeTimestamp(entry.initDataSendTime, entry.startTime),
    init_data_recv_time: toRelativeTimestamp(entry.initDataRecvTime, entry.startTime),
    view_layer_render_start_time: toRelativeTimestamp(entry.viewLayerRenderStartTime, entry.startTime),
    view_layer_render_end_time: toRelativeTimestamp(entry.viewLayerRenderEndTime, entry.startTime),
  }
  if (Object.values(detail).every((value) => value === undefined)) {
    return undefined
  }
  return detail
}

function mergePendingMetrics(
  pendingMetrics: Partial<RawRumViewEvent['view']>,
  metrics: Pick<RawRumViewEvent['view'], 'app_launch' | 'evaluate_script'>,
) {
  pendingMetrics.app_launch = metrics.app_launch ?? pendingMetrics.app_launch
  pendingMetrics.evaluate_script = (pendingMetrics.evaluate_script ?? 0) + (metrics.evaluate_script ?? 0)
}

export function startPerformanceCollection(lifeCycle: LifeCycle, pageObservable: Observable<PageEvent>) {
  let currentRoute: string | undefined
  let initialRoute: string | undefined
  const renderStartByRoute = new Map<string, number>()
  const pendingInitialMetrics: Partial<RawRumViewEvent['view']> = {}

  const performance = wx.getPerformance?.()
  const observer = performance?.createObserver((entryList) => {
    const entries = entryList.getEntries()

    entries.forEach((entry) => {
      const route = entry.path || currentRoute || initialRoute

      if (entry.entryType === 'render') {
        if (!route) {
          return
        }

        if (entry.name === 'firstRender') {
          renderStartByRoute.set(route, entry.startTime)
          lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
            route,
            metrics: {
              first_render: toServerDuration(entry.duration),
              first_render_detail: buildFirstRenderDetail(entry),
            },
          })
          return
        }

        const renderStartTime = renderStartByRoute.get(route)
        if (entry.name === 'firstContentfulPaint') {
          const timestamp = toRelativeTimestamp(entry.startTime, renderStartTime)
          if (timestamp !== undefined) {
            lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
              route,
              metrics: {
                performance: { fcp: { timestamp } },
              },
            })
          }
          return
        }

        if (entry.name === 'largestContentfulPaint') {
          const timestamp = toRelativeTimestamp(entry.startTime, renderStartTime)
          if (timestamp !== undefined) {
            lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
              route,
              metrics: {
                performance: { lcp: { timestamp } },
              },
            })
          }
          renderStartByRoute.delete(route)
        }
        return
      }

      if (entry.entryType === 'navigation' && entry.name === 'appLaunch') {
        const metrics = { app_launch: toServerDuration(entry.duration) }
        if (initialRoute) {
          lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, { route: initialRoute, metrics })
        } else {
          mergePendingMetrics(pendingInitialMetrics, metrics)
        }
        return
      }

      if (entry.entryType === 'script' && entry.name === 'evaluateScript') {
        if (entry.moduleName && entry.moduleName !== 'APP') {
          return
        }
        const metrics = { evaluate_script: toServerDuration(entry.duration) }
        if (initialRoute) {
          lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, { route: initialRoute, metrics })
        } else {
          mergePendingMetrics(pendingInitialMetrics, metrics)
        }
      }
    })
  })

  const subscription = pageObservable.subscribe((event) => {
    if ((event.lifecycle === 'load' || event.lifecycle === 'show') && event.route) {
      currentRoute = event.route
      if (!initialRoute) {
        initialRoute = event.route
        if (Object.keys(pendingInitialMetrics).length > 0) {
          lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
            route: initialRoute,
            metrics: pendingInitialMetrics,
          })
        }
      }
    }

    if (event.lifecycle === 'unload' && event.route) {
      renderStartByRoute.delete(event.route)
    }
  })

  observer?.observe({ entryTypes: ['render', 'script', 'navigation'] })

  return {
    stop: () => {
      subscription.unsubscribe()
      observer?.disconnect()
      renderStartByRoute.clear()
    },
  }
}
