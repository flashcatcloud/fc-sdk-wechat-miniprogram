import type { Observable } from '@flashcatcloud/miniprogram-core'
import { generateUUID, toServerDuration } from '@flashcatcloud/miniprogram-core'
import type { RequestCompleteEvent } from '@flashcatcloud/miniprogram-platform'
import type { ResourceType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

const RESOURCE_TYPE_BY_EXTENSION: Array<[ResourceType, RegExp]> = [
  ['css', /\.css$/i],
  ['js', /\.js$/i],
  ['image', /\.(gif|jpg|jpeg|tiff|png|svg|ico|webp|avif)$/i],
  ['font', /\.(woff|eot|woff2|ttf|otf)$/i],
  ['media', /\.(mp3|mp4|wav|ogg|webm|m4a|mov|avi)$/i],
]

function getResourceTypeFromUrl(url: string): ResourceType {
  const path = url.split(/[?#]/, 1)[0] || ''
  const match = RESOURCE_TYPE_BY_EXTENSION.find(([, extensionPattern]) => extensionPattern.test(path))

  return match?.[0] ?? 'other'
}

function mapRequestType(requestType: RequestCompleteEvent['requestType'], url: string): ResourceType {
  switch (requestType) {
    case 'download':
      return getResourceTypeFromUrl(url)
    default:
      return 'xhr'
  }
}

export function startRequestCollection(lifeCycle: LifeCycle, requestObservable: Observable<RequestCompleteEvent>) {
  const subscription = requestObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, event)
    if (event.requestType === 'upload') {
      return
    }
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: event.startTime,
      type: 'resource',
      ...(event.traceId || event.spanId
        ? {
            _dd: {
              trace_id: event.traceId,
              span_id: event.spanId,
            },
          }
        : {}),
      resource: {
        id: generateUUID(),
        type: mapRequestType(event.requestType, event.url),
        url: event.url,
        method: event.method,
        status_code: event.statusCode,
        duration: toServerDuration(event.duration),
        error_message: event.errorMessage,
        trace_id: event.traceId,
        span_id: event.spanId,
      },
    })
  })

  return {
    stop: () => subscription.unsubscribe(),
  }
}
