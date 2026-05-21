import test from 'node:test'
import assert from 'node:assert/strict'
import { startRum } from '../packages/miniprogram-rum/src/boot/startRum'
import { validateAndBuildRumConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'
import { LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import type { PlatformAdapter, RequestOptions, UploadFileOptions, DownloadFileOptions } from '../packages/miniprogram-platform/src/platform/types'

function createAdapter(): PlatformAdapter {
  let storage: unknown
  return {
    request: (options: RequestOptions) => {
      options.success?.({ statusCode: 200, data: 'ok' })
      options.complete?.()
      return { abort: () => undefined }
    },
    uploadFile: (options: UploadFileOptions) => {
      options.success?.({ statusCode: 200, data: 'ok' })
      options.complete?.()
      return { abort: () => undefined }
    },
    downloadFile: (options: DownloadFileOptions) => {
      options.success?.({ statusCode: 200, tempFilePath: '/tmp/file' })
      options.complete?.()
      return { abort: () => undefined }
    },
    setStorageSync: (_key, data) => {
      storage = data
    },
    getStorageSync: () => storage,
    removeStorageSync: () => {
      storage = undefined
    },
    getSystemInfoSync: () => ({}),
    getNetworkType: ({ success }: { success: (res: any) => void }) => success({ networkType: 'wifi' }),
    onNetworkStatusChange: () => undefined,
    onAppShow: () => undefined,
    onAppHide: () => undefined,
    onError: () => undefined,
    onUnhandledRejection: () => undefined,
    onPageNotFound: () => undefined,
    onLazyLoadError: () => undefined,
  }
}

test('startRum does not emit view events when trackPages is false', () => {
  const originalWx = (globalThis as any).wx
  const originalPage = (globalThis as any).Page
  ;(globalThis as any).wx = {
    request: (options: RequestOptions) => {
      options.success?.({ statusCode: 200, data: 'ok' })
      options.complete?.()
      return { abort: () => undefined }
    },
    uploadFile: (options: any) => {
      options.success?.({ statusCode: 200, data: 'ok' })
      options.complete?.()
      return { abort: () => undefined }
    },
    downloadFile: (options: any) => {
      options.success?.({ statusCode: 200, tempFilePath: '/tmp/file' })
      options.complete?.()
      return { abort: () => undefined }
    },
    getPerformance: () => undefined,
  }
  ;(globalThis as any).Page = (options: Record<string, any>) => options

  try {
    const configuration = validateAndBuildRumConfiguration({
      clientToken: 'token',
      applicationId: 'app',
      trackPages: false,
      trackActions: false,
      trackPerformance: false,
      flushInterval: 100000,
    })!
    const started = startRum(configuration, createAdapter())
    const collected: any[] = []
    started.lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => collected.push(event))

    started.startPage('manual-page')

    started.stop()
    assert.equal(collected.some((event) => event.type === 'view'), false)
  } finally {
    ;(globalThis as any).wx = originalWx
    ;(globalThis as any).Page = originalPage
  }
})

test('startRum does not emit RUM events when session is sampled out', () => {
  const originalWx = (globalThis as any).wx
  const originalPage = (globalThis as any).Page
  ;(globalThis as any).wx = {
    request: (options: RequestOptions) => {
      options.success?.({ statusCode: 200, data: 'ok' })
      options.complete?.()
      return { abort: () => undefined }
    },
    uploadFile: (options: any) => {
      options.success?.({ statusCode: 200, data: 'ok' })
      options.complete?.()
      return { abort: () => undefined }
    },
    downloadFile: (options: any) => {
      options.success?.({ statusCode: 200, tempFilePath: '/tmp/file' })
      options.complete?.()
      return { abort: () => undefined }
    },
    getPerformance: () => undefined,
  }
  ;(globalThis as any).Page = (options: Record<string, any>) => options

  try {
    const configuration = validateAndBuildRumConfiguration({
      clientToken: 'token',
      applicationId: 'app',
      sessionSampleRate: 0,
      trackPages: false,
      trackActions: false,
      trackPerformance: false,
      flushInterval: 100000,
    })!
    const started = startRum(configuration, createAdapter())
    const collected: any[] = []
    started.lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => collected.push(event))

    started.addCustomEvent('sampled-out-event')

    started.stop()
    assert.equal(collected.length, 0)
  } finally {
    ;(globalThis as any).wx = originalWx
    ;(globalThis as any).Page = originalPage
  }
})

test('startRum reports traced resource events with backend-compatible _dd identifiers', () => {
  const adapter = createAdapter()
  let capturedRequestOptions: RequestOptions | undefined
  adapter.request = (options: RequestOptions) => {
    capturedRequestOptions = options
    options.success?.({ statusCode: 200, data: 'ok' })
    options.complete?.()
    return { abort: () => undefined }
  }

  const configuration = validateAndBuildRumConfiguration({
    clientToken: 'token',
    applicationId: 'app',
    trackPages: false,
    trackActions: false,
    trackPerformance: false,
    flushInterval: 100000,
    tracing: { enabled: true, sampleRate: 100 },
  })!
  const started = startRum(configuration, adapter)
  const collected: any[] = []
  started.lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => collected.push(event))

  adapter.request({ url: 'https://api.example.com/data' })

  started.stop()

  const traceparent = capturedRequestOptions?.header?.traceparent
  assert.ok(traceparent)
  const [, traceId, spanId] = traceparent.split('-')
  const traceIdDecimal = BigInt(`0x${traceId.slice(16)}`).toString(10)
  const spanIdDecimal = BigInt(`0x${spanId}`).toString(10)
  const resourceEvent = collected.find((event) => event.type === 'resource')
  assert.ok(resourceEvent)
  assert.equal(traceId.slice(0, 16), '0000000000000000')
  assert.equal(resourceEvent._dd.trace_id, traceIdDecimal)
  assert.equal(resourceEvent._dd.span_id, spanIdDecimal)
})
