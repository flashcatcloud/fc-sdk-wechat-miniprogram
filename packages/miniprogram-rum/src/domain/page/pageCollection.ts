import type { Observable } from '@flashcatcloud/miniprogram-core'
import type { PageEvent } from '@flashcatcloud/miniprogram-platform'
import { LifeCycleEventType } from '../lifeCycle'
import type { LifeCycle } from '../lifeCycle'
import type { PageHistoryEntry } from '../contexts/pageHistory'

export interface PageCollection {
  stop: () => void
  getCurrentPage: () => PageHistoryEntry | undefined
  startManualPage: (name: string) => void
}

// 周期性更新间隔，与 browser-sdk 保持一致
const PAGE_UPDATE_INTERVAL = 3000 // 3秒

export function startPageCollection(lifeCycle: LifeCycle, pageObservable: Observable<PageEvent>) {
  let currentPage: PageHistoryEntry | undefined

  // 周期性更新函数
  function schedulePageUpdate(page: PageHistoryEntry) {
    const intervalId = setInterval(() => {
      if (!page) return

      const time_spent = Date.now() - page.startTime
      page.documentVersion = (page.documentVersion || 0) + 1

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: Date.now(),
        type: 'page',
        page: {
          id: page.id,
          name: page.name,
          time_spent,
          document_version: page.documentVersion,
          is_active: true,
        },
      })
    }, PAGE_UPDATE_INTERVAL)

    return intervalId
  }

  // 停止周期性更新
  function stopPageUpdate(page: PageHistoryEntry | undefined) {
    if (page?.updateIntervalId) {
      clearInterval(page.updateIntervalId)
      page.updateIntervalId = undefined
    }
  }

  const subscription = pageObservable.subscribe((event) => {
    // load：创建新页面，记录 loadTime
    if (event.lifecycle === 'load') {
      // 清理之前的定时器（如果存在）
      stopPageUpdate(currentPage)

      currentPage = {
        id: `${event.time}-${Math.random().toString(16).slice(2)}`,
        name: event.route || 'unknown',
        startTime: event.time,
        loadTime: event.time,  // 记录 load 时间，用于计算 loading_time
        documentVersion: 0,
      }

      lifeCycle.notify(LifeCycleEventType.PAGE_EVENT, event)
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: event.time,
        type: 'page',
        page: {
          id: currentPage.id,
          name: currentPage.name,
          document_version: currentPage.documentVersion,
          is_active: true,
        },
      })

      // 开始周期性更新
      currentPage.updateIntervalId = schedulePageUpdate(currentPage)
    }

    // ready：计算并上报 loading_time
    if (event.lifecycle === 'ready' && currentPage && currentPage.loadTime) {
      const loading_time = event.time - currentPage.loadTime
      currentPage.documentVersion = (currentPage.documentVersion || 0) + 1

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: event.time,
        type: 'page',
        page: {
          id: currentPage.id,
          name: currentPage.name,
          loading_time,
          document_version: currentPage.documentVersion,
          is_active: true,
        },
      })
    }

    // 首次 show（无 currentPage）：创建新页面
    if (event.lifecycle === 'show' && !currentPage) {
      stopPageUpdate(currentPage)

      currentPage = {
        id: `${event.time}-${Math.random().toString(16).slice(2)}`,
        name: event.route || 'unknown',
        startTime: event.time,
        documentVersion: 0,
      }

      lifeCycle.notify(LifeCycleEventType.PAGE_EVENT, event)
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: event.time,
        type: 'page',
        page: {
          id: currentPage.id,
          name: currentPage.name,
          document_version: currentPage.documentVersion,
          is_active: true,
        },
      })

      currentPage.updateIntervalId = schedulePageUpdate(currentPage)
    }

    // 从后台恢复（hide 后的 show）：恢复定时器
    if (event.lifecycle === 'show' && currentPage && !currentPage.updateIntervalId) {
      // 发送 show 事件（带当前 time_spent）
      const time_spent = event.time - currentPage.startTime
      currentPage.documentVersion = (currentPage.documentVersion || 0) + 1

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: event.time,
        type: 'page',
        page: {
          id: currentPage.id,
          name: currentPage.name,
          time_spent,
          document_version: currentPage.documentVersion,
          is_active: true,
        },
      })

      // 恢复周期性更新
      currentPage.updateIntervalId = schedulePageUpdate(currentPage)
    }

    // hide：暂停更新，但保留页面状态
    if (event.lifecycle === 'hide' && currentPage) {
      // 停止定时器
      stopPageUpdate(currentPage)

      // 发送 hide 时的状态
      const time_spent = event.time - currentPage.startTime
      currentPage.documentVersion = (currentPage.documentVersion || 0) + 1

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: event.time,
        type: 'page',
        page: {
          id: currentPage.id,
          name: currentPage.name,
          time_spent,
          document_version: currentPage.documentVersion,
          is_active: false,
        },
      })
    }

    // unload：停止更新并发送最终事件
    if (event.lifecycle === 'unload' && currentPage) {
      // 停止定时器
      stopPageUpdate(currentPage)

      // 发送最终事件
      const time_spent = event.time - currentPage.startTime
      currentPage.documentVersion = (currentPage.documentVersion || 0) + 1

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: event.time,
        type: 'page',
        page: {
          id: currentPage.id,
          name: currentPage.name,
          time_spent,
          document_version: currentPage.documentVersion,
          is_active: false,
        },
      })

      currentPage = undefined
    }
  })

  return {
    stop: () => {
      // 清理定时器
      stopPageUpdate(currentPage)
      subscription.unsubscribe()
    },
    getCurrentPage: () => currentPage,
    startManualPage: (name: string) => {
      // 清理之前的定时器
      stopPageUpdate(currentPage)

      const time = Date.now()
      currentPage = {
        id: `${time}-${Math.random().toString(16).slice(2)}`,
        name,
        startTime: time,
        documentVersion: 0,
      }

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: time,
        type: 'page',
        page: {
          id: currentPage.id,
          name: currentPage.name,
          document_version: currentPage.documentVersion,
          is_active: true,
        },
      })

      // 开始周期性更新
      currentPage.updateIntervalId = schedulePageUpdate(currentPage)
    },
  }
}
