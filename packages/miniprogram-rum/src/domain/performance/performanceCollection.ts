import type { Observable } from '@flashcatcloud/miniprogram-core'
import type { PageEvent } from '@flashcatcloud/miniprogram-platform'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

export function startPerformanceCollection(lifeCycle: LifeCycle, pageObservable: Observable<PageEvent>) {
  const pageStartTimes = new Map<string, number>()

  const subscription = pageObservable.subscribe((event) => {
    if (event.lifecycle === 'load') {
      pageStartTimes.set(event.route, event.time)
    }
    if (event.lifecycle === 'ready') {
      const startTime = pageStartTimes.get(event.route)
      if (startTime) {
        const duration = event.time - startTime
        lifeCycle.notify(LifeCycleEventType.PERFORMANCE_COLLECTED, {
          name: 'page_ready',
          value: duration,
          time: event.time,
        })
        lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
          date: event.time,
          type: 'performance',
          performance: {
            name: 'page_ready',
            value: duration,
          },
        })
        pageStartTimes.delete(event.route)
      }
    }
  })

  return {
    stop: () => subscription.unsubscribe(),
  }
}
