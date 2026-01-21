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

export function startPageCollection(lifeCycle: LifeCycle, pageObservable: Observable<PageEvent>) {
  let currentPage: PageHistoryEntry | undefined
  const subscription = pageObservable.subscribe((event) => {
    if (event.lifecycle === 'load' || event.lifecycle === 'show') {
      currentPage = {
        id: `${event.time}-${Math.random().toString(16).slice(2)}`,
        name: event.route || 'unknown',
        startTime: event.time,
      }
      lifeCycle.notify(LifeCycleEventType.PAGE_EVENT, event)
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: event.time,
        type: 'page',
        page: {
          id: currentPage.id,
          name: currentPage.name,
        },
      })
    }

    if (event.lifecycle === 'unload' && currentPage) {
      const timeSpent = event.time - currentPage.startTime
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: event.time,
        type: 'page',
        page: {
          id: currentPage.id,
          name: currentPage.name,
          timeSpent,
        },
      })
      currentPage = undefined
    }
  })

  return {
    stop: () => subscription.unsubscribe(),
    getCurrentPage: () => currentPage,
    startManualPage: (name: string) => {
      const time = Date.now()
      currentPage = {
        id: `${time}-${Math.random().toString(16).slice(2)}`,
        name,
        startTime: time,
      }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: time,
        type: 'page',
        page: {
          id: currentPage.id,
          name: currentPage.name,
        },
      })
    },
  }
}
