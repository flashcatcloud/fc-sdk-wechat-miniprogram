import { Observable } from '@flashcatcloud/miniprogram-core'
import type { PlatformAdapter, RequestOptions, RequestTask } from '../platform/types'

export interface RequestStartEvent {
  url: string
  method: string
  startTime: number
}

export interface RequestCompleteEvent {
  url: string
  method: string
  startTime: number
  duration: number
  statusCode?: number
  errorMessage?: string
}

declare let wx: { request: (options: RequestOptions) => RequestTask }

export function initRequestObservable(adapter: PlatformAdapter) {
  const observable = new Observable<RequestCompleteEvent>()
  const originalRequest = adapter.request
  const originalWxRequest = wx.request

  function wrapRequest(request: (options: RequestOptions) => RequestTask, options: RequestOptions) {
    const startTime = Date.now()
    const method = (options.method || 'GET').toUpperCase()
    const url = options.url

    return request({
      ...options,
      success: (res) => {
        options.success?.(res)
        observable.notify({
          url,
          method,
          startTime,
          duration: Date.now() - startTime,
          statusCode: res.statusCode,
        })
      },
      fail: (error) => {
        options.fail?.(error)
        observable.notify({
          url,
          method,
          startTime,
          duration: Date.now() - startTime,
          errorMessage: error.errMsg,
        })
      },
      complete: () => {
        options.complete?.()
      },
    })
  }

  adapter.request = (options: RequestOptions) => wrapRequest(originalRequest, options)
  wx.request = (options: RequestOptions) => wrapRequest(originalWxRequest, options)

  return {
    observable,
    stop: () => {
      adapter.request = originalRequest
      wx.request = originalWxRequest
    },
  }
}
