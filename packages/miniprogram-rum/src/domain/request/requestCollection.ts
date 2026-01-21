import type { Observable } from '@flashcatcloud/miniprogram-core'
import type { RequestCompleteEvent } from '@flashcatcloud/miniprogram-platform'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

export function startRequestCollection(lifeCycle: LifeCycle, requestObservable: Observable<RequestCompleteEvent>) {
  const subscription = requestObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, event)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: event.startTime + event.duration,
      type: 'request',
      request: {
        url: event.url,
        method: event.method,
        statusCode: event.statusCode,
        duration: event.duration,
        errorMessage: event.errorMessage,
      },
    })
  })

  return {
    stop: () => subscription.unsubscribe(),
  }
}
