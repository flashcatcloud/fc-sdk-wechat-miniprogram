import type { Observable } from '@flashcatcloud/miniprogram-core'
import { generateUUID } from '@flashcatcloud/miniprogram-core'
import type { RequestCompleteEvent } from '@flashcatcloud/miniprogram-platform'
import type { ResourceType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

function mapRequestType(requestType: RequestCompleteEvent['requestType']): ResourceType {
  switch (requestType) {
    case 'upload':
      return 'upload'
    case 'download':
      return 'download'
    default:
      return 'xhr'
  }
}

export function startRequestCollection(lifeCycle: LifeCycle, requestObservable: Observable<RequestCompleteEvent>) {
  const subscription = requestObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, event)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: event.startTime,
      type: 'resource',
      resource: {
        id: generateUUID(),
        type: mapRequestType(event.requestType),
        url: event.url,
        method: event.method,
        status_code: event.statusCode,
        duration: event.duration,
        error_message: event.errorMessage,
      },
    })
  })

  return {
    stop: () => subscription.unsubscribe(),
  }
}
