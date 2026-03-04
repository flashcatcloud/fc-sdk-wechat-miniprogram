import { Observable } from '@flashcatcloud/miniprogram-core'
import type {
  PlatformAdapter,
  RequestOptions,
  RequestTask,
  UploadFileOptions,
  UploadTask,
  DownloadFileOptions,
  DownloadTask,
} from '../platform/types'
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
  requestType?: 'xhr' | 'upload' | 'download' // 请求类型
  traceId?: string // Trace ID (用于分布式追踪)
  spanId?: string // Span ID (当前请求的 span)
}

export interface TracingConfig {
  /**
   * 是否启用分布式追踪
   * @default false
   */
  enabled?: boolean

  /**
   * 采样率 (0-1)
   * @default 1 (100% 采样)
   */
  sampleRate?: number

  /**
   * 根 trace context (可选)
   * 如果提供，所有请求将作为此 trace 的子 span
   */
  rootTraceContext?: TraceContext

  /**
   * 自定义 trace header 名称 (可选)
   * @default 'traceparent'
   */
  headerName?: string
}

declare let wx: {
  request: (options: RequestOptions) => RequestTask
  uploadFile: (options: UploadFileOptions) => UploadTask
  downloadFile: (options: DownloadFileOptions) => DownloadTask
}

export function initRequestObservable(adapter: PlatformAdapter, tracingConfig?: TracingConfig) {
  const observable = new Observable<RequestCompleteEvent>()
  const requestStartObservable = new Observable<RequestStartEvent>()
  const originalRequest = adapter.request
  const originalWxRequest = wx.request
  const originalWxUploadFile = wx.uploadFile
  const originalWxDownloadFile = wx.downloadFile

  // Trace 配置
  const tracing = {
    enabled: tracingConfig?.enabled ?? false,
    sampleRate: tracingConfig?.sampleRate ?? 1,
    rootTraceContext: tracingConfig?.rootTraceContext,
    headerName: tracingConfig?.headerName ?? 'traceparent',
  }

  /**
   * 判断是否应该采样
   */
  function shouldSample(): boolean {
    return tracing.enabled && Math.random() < tracing.sampleRate
  }

  /**
   * 为请求注入 W3C Trace Context header (OpenTelemetry 标准)
   */
  function injectTraceHeader<T extends { header?: Record<string, string> }>(
    options: T,
  ): { options: T; traceContext: TraceContext | null } {
    if (!shouldSample()) {
      return { options, traceContext: null }
    }

    // 创建或继承 trace context
    const traceContext = tracing.rootTraceContext ? createChildSpan(tracing.rootTraceContext) : createTraceContext(true)

    // 注入 W3C traceparent header (OpenTelemetry 标准)
    const traceparent = generateTraceparent(traceContext)
    options.header = options.header || {}
    options.header[tracing.headerName] = traceparent

    return { options, traceContext }
  }

  function wrapRequest(request: (options: RequestOptions) => RequestTask, options: RequestOptions) {
    const startTime = Date.now()
    const method = (options.method || 'GET').toUpperCase()
    const url = options.url

    requestStartObservable.notify({ url, method, startTime })

    // 注入 trace header
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

    requestStartObservable.notify({ url, method: 'POST', startTime })

    // 注入 trace header
    const { options: optionsWithTrace, traceContext } = injectTraceHeader(options)

    return uploadFile({
      ...optionsWithTrace,
      success: (res) => {
        options.success?.(res)
        observable.notify({
          url,
          method: 'POST', // uploadFile 总是 POST
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

    requestStartObservable.notify({ url, method: 'GET', startTime })

    // 注入 trace header
    const { options: optionsWithTrace, traceContext } = injectTraceHeader(options)

    return downloadFile({
      ...optionsWithTrace,
      success: (res) => {
        options.success?.(res)
        observable.notify({
          url,
          method: 'GET', // downloadFile 总是 GET
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

  adapter.request = (options: RequestOptions) => wrapRequest(originalRequest, options)
  wx.request = (options: RequestOptions) => wrapRequest(originalWxRequest, options)
  wx.uploadFile = (options: UploadFileOptions) => wrapUploadFile(originalWxUploadFile, options)
  wx.downloadFile = (options: DownloadFileOptions) => wrapDownloadFile(originalWxDownloadFile, options)

  return {
    observable,
    requestStartObservable,
    stop: () => {
      adapter.request = originalRequest
      wx.request = originalWxRequest
      wx.uploadFile = originalWxUploadFile
      wx.downloadFile = originalWxDownloadFile
    },
  }
}
