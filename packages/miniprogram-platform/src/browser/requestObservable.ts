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

export function initRequestObservable(adapter: PlatformAdapter, tracingConfig?: TracingConfig) {
  const observable = new Observable<RequestCompleteEvent>()
  const requestStartObservable = new Observable<RequestStartEvent>()
  const originalRequest = adapter.request
  const originalUploadFile = adapter.uploadFile
  const originalDownloadFile = adapter.downloadFile

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

  function wrapRequest(options: RequestOptions) {
    const startTime = Date.now()
    const method = (options.method || 'GET').toUpperCase()
    const url = options.url

    if (isInternalRequest(options) || isIntakeUrl(url)) {
      return originalRequest.call(adapter, options)
    }

    requestStartObservable.notify({ url, method, startTime })

    const { options: optionsWithTrace, traceContext } = injectTraceHeader(options)

    return originalRequest.call(adapter, {
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

  function wrapUploadFile(options: UploadFileOptions) {
    const startTime = Date.now()
    const url = options.url

    if (isIntakeUrl(url)) {
      return originalUploadFile.call(adapter, options)
    }

    requestStartObservable.notify({ url, method: 'POST', startTime })

    const { options: optionsWithTrace, traceContext } = injectTraceHeader(options)

    return originalUploadFile.call(adapter, {
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

  function wrapDownloadFile(options: DownloadFileOptions) {
    const startTime = Date.now()
    const url = options.url

    if (isIntakeUrl(url)) {
      return originalDownloadFile.call(adapter, options)
    }

    requestStartObservable.notify({ url, method: 'GET', startTime })

    const { options: optionsWithTrace, traceContext } = injectTraceHeader(options)

    return originalDownloadFile.call(adapter, {
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

  // Patch adapter methods so all calls through the adapter are intercepted
  adapter.request = wrapRequest
  adapter.uploadFile = wrapUploadFile
  adapter.downloadFile = wrapDownloadFile

  return {
    observable,
    requestStartObservable,
    stop: () => {
      adapter.request = originalRequest
      adapter.uploadFile = originalUploadFile
      adapter.downloadFile = originalDownloadFile
    },
  }
}
