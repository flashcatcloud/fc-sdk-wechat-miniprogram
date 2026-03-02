import type { EndpointBuilder, HttpRequest, Payload } from '@flashcatcloud/miniprogram-core'
import { newRetryState, sendWithRetryStrategy, persistPayload } from '@flashcatcloud/miniprogram-core'
import type { PlatformAdapter } from '../platform/types'

export function createHttpRequest(
  adapter: PlatformAdapter,
  endpointBuilder: EndpointBuilder,
  debug?: boolean,
): HttpRequest {
  const retryState = newRetryState()

  function requestStrategy(payload: Payload, onResponse: (r: { status: number }) => void) {
    const url = endpointBuilder.build({ encoding: payload.encoding })

    if (debug) {
      console.log('[FlashCat RUM] 📤 发送数据', {
        url,
        数据大小: `${payload.bytesCount} bytes`,
        retryCount: payload.retry?.count,
      })
    }

    adapter.request({
      url,
      method: 'POST',
      data: payload.data,
      header: {
        'Content-Type': 'text/plain;charset=UTF-8',
      },
      success: (res: any) => {
        if (debug) {
          console.log('[FlashCat RUM] ✅ 数据上报成功', {
            statusCode: res.statusCode,
            url,
          })
        }
        onResponse({ status: res.statusCode })
      },
      fail: (err: any) => {
        if (debug) {
          console.error('[FlashCat RUM] ❌ 数据上报失败', {
            url,
            error: err.errMsg || err,
          })
        }
        onResponse({ status: 0 }) // Use 0 for network errors
      },
    })
  }

  function sendPayload(payload: Payload) {
    sendWithRetryStrategy(payload, retryState, requestStrategy, (exhaustedPayload) => {
      if (debug) {
        console.warn('[FlashCat RUM] ⚠️ 重试次数超限，持久化到本地存储')
      }
      persistPayload(adapter, exhaustedPayload)
    })
  }

  return {
    send: sendPayload,
    sendOnExit: (payload) => {
      // Direct send on exit, no retry queue
      requestStrategy(payload, () => {
        /* ignore */
      })
    },
  }
}
