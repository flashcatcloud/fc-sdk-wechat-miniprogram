import type { EndpointBuilder, HttpRequest, Payload } from '@flashcatcloud/miniprogram-core'
import type { PlatformAdapter } from '../platform/types'

export function createHttpRequest(
  adapter: PlatformAdapter, 
  endpointBuilder: EndpointBuilder,
  debug?: boolean
): HttpRequest {
  function sendPayload(payload: Payload) {
    const url = endpointBuilder.build({ encoding: payload.encoding })
    
    if (debug) {
      console.log('[FlashCat RUM] 📤 发送数据', {
        url,
        数据大小: `${payload.bytesCount} bytes`,
        内容预览: payload.data?.substring(0, 200) + (payload.data && payload.data.length > 200 ? '...' : ''),
      })
    }
    
    adapter.request({
      url,
      method: 'POST',
      data: payload.data,
      success: (res: any) => {
        if (debug) {
          console.log('[FlashCat RUM] ✅ 数据上报成功', {
            statusCode: res.statusCode,
            url,
          })
        }
      },
      fail: (err: any) => {
        console.error('[FlashCat RUM] ❌ 数据上报失败', {
          url,
          error: err.errMsg || err,
        })
      }
    })
  }

  return {
    send: sendPayload,
    sendOnExit: sendPayload,
  }
}
