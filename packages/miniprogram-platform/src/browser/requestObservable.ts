import { isIntakeUrl, Observable } from '@flashcatcloud/miniprogram-core'
import type {
  PlatformAdapter,
  RequestOptions,
  RequestTask,
  UploadFileOptions,
  UploadTask,
  DownloadFileOptions,
  DownloadTask,
} from '../platform/types'
import { isInternalRequest } from '../platform/internalRequest'
import type { TraceContext } from '@flashcatcloud/miniprogram-core'
import { createTraceContext, createChildSpan, generateTraceparent } from '@flashcatcloud/miniprogram-core'

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
  requestType?: 'xhr' | 'upload' | 'download'
  traceId?: string
  spanId?: string
}

export interface TracingConfig {
  enabled?: boolean
  sampleRate?: number
  rootTraceContext?: TraceContext
  headerName?: string
}

declare let wx: {
  request: (options: RequestOptions) => RequestTask
  uploadFile: (options: UploadFileOptions) => UploadTask
  downloadFile: (options: DownloadFileOptions) => DownloadTask
}

export function initRequestObservable(_adapter: PlatformAdapter, tracingConfig?: TracingConfig) {
  const observable = new Observable<RequestCompleteEvent>()
  const requestStartObservable = new Observable<RequestStartEvent>()
  const originalWxRequest = wx.request
  const originalWxUploadFile = wx.uploadFile
  const originalWxDownloadFile = wx.downloadFile

  const tracing = {
    enabled: tracingConfig?.enabled ?? false,
    sampleRate: tracingConfig?.sampleRate ?? 1,
    rootTraceContext: tracingConfig?.rootTraceContext,
    headerName: tracingConfig?.headerName ?? 'traceparent',
  }

  function shouldSample(): boolean {
    return tracing.enabled && Math.random() < tracing.sampleRate
  }

  function injectTraceHeader<T extends { header?: Record<string, string> }>(
    options: T,
  ): { options: T; traceContext: TraceContext | null } {
    if (!shouldSample()) {
      return { options, traceContext: null }
    }

    const traceContext = tracing.rootTraceContext ? createChildSpan(tracing.rootTraceContext) : createTraceContext(true)

    const traceparent = generateTraceparent(traceContext)
    options.header = options.header || {}
    options.header[tracing.headerName] = traceparent

    return { options, traceContext }
  }

  function wrapRequest(request: (options: RequestOptions) => RequestTask, options: RequestOptions) {
    const startTime = Date.now()
    const method = (options.method || 'GET').toUpperCase()
    const url = options.url

    if (isInternalRequest(options) || isIntakeUrl(url)) {
      return request(options)
    }

    requestStartObservable.notify({ url, method, startTime })

    const { options: optionsWithTrace, traceContext } = injectTraceHeader(options)

    return request({
      ...optionsWithTrace,
      success: (res) => {
        options.success?.(res)
        observable.notify({
          url,
          method,
          startTime,
          duration: Date.now() - startTime,
          statusCode: res.statusCode,
          requestType: 'xhr',
          traceId: traceContext?.traceId,
          spanId: traceContext?.spanId,
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
          requestType: 'xhr',
          traceId: traceContext?.traceId,
          spanId: traceContext?.spanId,
        })
      },
      complete: () => {
        options.complete?.()
      },
    })
  }

  function wrapUploadFile(uploadFile: (options: UploadFileOptions) => UploadTask, options: UploadFileOptions) {
    const startTime = Date.now()
    const url = options.url

    if (isIntakeUrl(url)) {
      return uploadFile(options)
    }

    requestStartObservable.notify({ url, method: 'POST', startTime })

    const { options: optionsWithTrace, traceContext } = injectTraceHeader(options)

    return uploadFile({
      ...optionsWithTrace,
      success: (res) => {
        options.success?.(res)
        observable.notify({
          url,
          method: 'POST',
          startTime,
          duration: Date.now() - startTime,
          statusCode: res.statusCode,
          requestType: 'upload',
          traceId: traceContext?.traceId,
          spanId: traceContext?.spanId,
        })
      },
      fail: (error) => {
        options.fail?.(error)
        observable.notify({
          url,
          method: 'POST',
          startTime,
          duration: Date.now() - startTime,
          errorMessage: error.errMsg,
          requestType: 'upload',
          traceId: traceContext?.traceId,
          spanId: traceContext?.spanId,
        })
      },
      complete: () => {
        options.complete?.()
      },
    })
  }

  function wrapDownloadFile(
    downloadFile: (options: DownloadFileOptions) => DownloadTask,
    options: DownloadFileOptions,
  ) {
    const startTime = Date.now()
    const url = options.url

    if (isIntakeUrl(url)) {
      return downloadFile(options)
    }

    requestStartObservable.notify({ url, method: 'GET', startTime })

    const { options: optionsWithTrace, traceContext } = injectTraceHeader(options)

    return downloadFile({
      ...optionsWithTrace,
      success: (res) => {
        options.success?.(res)
        observable.notify({
          url,
          method: 'GET',
          startTime,
          duration: Date.now() - startTime,
          statusCode: res.statusCode,
          requestType: 'download',
          traceId: traceContext?.traceId,
          spanId: traceContext?.spanId,
        })
      },
      fail: (error) => {
        options.fail?.(error)
        observable.notify({
          url,
          method: 'GET',
          startTime,
          duration: Date.now() - startTime,
          errorMessage: error.errMsg,
          requestType: 'download',
          traceId: traceContext?.traceId,
          spanId: traceContext?.spanId,
        })
      },
      complete: () => {
        options.complete?.()
      },
    })
  }

  wx.request = (options: RequestOptions) => wrapRequest(originalWxRequest, options)
  wx.uploadFile = (options: UploadFileOptions) => wrapUploadFile(originalWxUploadFile, options)
  wx.downloadFile = (options: DownloadFileOptions) => wrapDownloadFile(originalWxDownloadFile, options)

  return {
    observable,
    requestStartObservable,
    stop: () => {
      wx.request = originalWxRequest
      wx.uploadFile = originalWxUploadFile
      wx.downloadFile = originalWxDownloadFile
    },
  }
}
