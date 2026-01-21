import type { EndpointBuilder, HttpRequest, Payload } from '@flashcatcloud/miniprogram-core'
import type { PlatformAdapter } from '../platform/types'

export function createHttpRequest(adapter: PlatformAdapter, endpointBuilder: EndpointBuilder): HttpRequest {
  function sendPayload(payload: Payload) {
    adapter.request({
      url: endpointBuilder.build({ encoding: payload.encoding }),
      method: 'POST',
      data: payload.data,
    })
  }

  return {
    send: sendPayload,
    sendOnExit: sendPayload,
  }
}
