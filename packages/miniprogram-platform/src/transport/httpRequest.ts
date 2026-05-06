import type { EndpointBuilder, HttpRequest, Payload } from '@flashcatcloud/miniprogram-core'
import { newRetryState, sendWithRetryStrategy, persistPayload } from '@flashcatcloud/miniprogram-core'
import type { PlatformAdapter } from '../platform/types'
import { markInternalRequest } from '../platform/internalRequest'

export function createHttpRequest(
  adapter: PlatformAdapter,
  endpointBuilder: EndpointBuilder,
  debug?: boolean,
): HttpRequest {
  const retryState = newRetryState()

  function requestStrategy(payload: Payload, onResponse: (r: { status: number }) => void) {
    const url = endpointBuilder.build({ encoding: payload.encoding })

    if (debug) {
      console.log('[FlashCat RUM] Sending data', {
        url,
        dataSize: `${payload.bytesCount} bytes`,
        retryCount: payload.retry?.count,
      })
    }

    adapter.request(
      markInternalRequest({
        url,
        method: 'POST',
        data: payload.data,
        header: {
          'Content-Type': 'text/plain;charset=UTF-8',
        },
        success: (res: any) => {
          if (debug) {
            console.log('[FlashCat RUM] Data sent successfully', {
              statusCode: res.statusCode,
              url,
            })
          }
          onResponse({ status: res.statusCode })
        },
        fail: (err: any) => {
          if (debug) {
            console.error('[FlashCat RUM] Failed to send data', {
              url,
              error: err.errMsg || err,
            })
          }
          onResponse({ status: 0 })
        },
      }),
    )
  }

  function sendPayload(payload: Payload) {
    sendWithRetryStrategy(payload, retryState, requestStrategy, (exhaustedPayload) => {
      if (debug) {
        console.warn('[FlashCat RUM] Retry limit exceeded, persisting to local storage')
      }
      persistPayload(adapter, exhaustedPayload)
    })
  }

  return {
    send: sendPayload,
    sendOnExit: (payload) => {
      requestStrategy(payload, () => {
        /* ignore */
      })
    },
  }
}
