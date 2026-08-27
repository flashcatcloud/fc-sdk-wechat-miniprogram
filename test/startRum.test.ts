import test from 'node:test'
import assert from 'node:assert/strict'
import { startRum } from '../packages/miniprogram-rum/src/boot/startRum'
import { validateAndBuildRumConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'
import { LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import type { PlatformAdapter, RequestOptions, UploadFileOptions, DownloadFileOptions } from '../packages/miniprogram-platform/src/platform/types'

function createAdapter(): PlatformAdapter {
  const storage = new Map<string, unknown>()
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
    setStorageSync: (key, data) => {
      storage.set(key, data)
    },
    getStorageSync: (key) => storage.get(key),
    removeStorageSync: (key) => {
      storage.delete(key)
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

test('remote sampling keeps the current session and applies after stopSession', async () => {
  const adapter = createAdapter()
  const requests: RequestOptions[] = []
  let remoteRequest: RequestOptions | undefined
  adapter.request = (options: RequestOptions) => {
    requests.push(options)
    if (options.url.includes('/api/v2/rum/config')) {
      remoteRequest = options
    }
    return { abort: () => undefined }
  }

  const configuration = validateAndBuildRumConfiguration({
    clientToken: 'token',
    applicationId: 'app',
    sessionSampleRate: 100,
    remoteConfigurationEnabled: true,
    trackPages: false,
    trackActions: false,
    trackPerformance: false,
    flushInterval: 100000,
  })!
  const started = startRum(configuration, adapter)
  const collected: any[] = []
  started.lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => collected.push(event))

  const initialSession = started.sessionManager.findSession()!
  assert.equal(initialSession.sessionSampleRate, 100)
  assert.equal(initialSession.rcVersion, 0)

  await Promise.resolve()
  assert.ok(remoteRequest)
  remoteRequest.success?.({
    statusCode: 200,
    data: { version: 8, enabled: true, rum: { sessionSampleRate: 0 } },
  })
  assert.equal(collected.some((event) => event.type === 'resource' || event.type === 'error'), false)

  started.addCustomEvent('current-session-still-sampled')
  assert.equal(collected.length, 1)

  started.sessionManager.expire()
  started.addCustomEvent('next-session-sampled-out')
  const nextSession = started.sessionManager.findSession()!
  assert.equal(nextSession.sessionSampleRate, 0)
  assert.equal(nextSession.rcVersion, 8)
  assert.equal(nextSession.isTracked, false)
  assert.equal(collected.length, 1)
  started.addCustomEvent('same-sampled-out-session')
  assert.equal(started.sessionManager.findSession()?.id, nextSession.id)
  assert.equal(collected.length, 1)
  assert.equal(requests.filter((request) => request.url.includes('/api/v2/rum/config')).length, 1)

  started.stop()
})

test('asks the console again when a session is renewed', async () => {
  // A miniprogram process routinely outlives a session: backgrounded and foregrounded for hours
  // without a cold onLaunch. Asking only at start-up would leave every later session in that
  // process drawing against whatever the configuration was when the app first opened, which is
  // the one promise the whole feature makes.
  const adapter = createAdapter()
  const configRequests: RequestOptions[] = []
  adapter.request = (options: RequestOptions) => {
    if (options.url.includes('/api/v2/rum/config')) {
      configRequests.push(options)
    }
    return { abort: () => undefined }
  }

  const configuration = validateAndBuildRumConfiguration({
    clientToken: 'token',
    applicationId: 'app',
    sessionSampleRate: 100,
    remoteConfigurationEnabled: true,
    trackPages: false,
    trackActions: false,
    trackPerformance: false,
    flushInterval: 100000,
  })!
  const started = startRum(configuration, adapter)

  await Promise.resolve()
  assert.equal(configRequests.length, 1)
  configRequests[0].success?.({
    statusCode: 200,
    data: { version: 4, enabled: true, rum: { sessionSampleRate: 100 } },
  })

  started.sessionManager.expire()
  started.addCustomEvent('draws-a-new-session')

  assert.equal(configRequests.length, 2, 'a renewed session must ask for the configuration again')
  assert.ok(
    configRequests[1].url.includes('applied_version=4'),
    'the new request reports the version the renewed session was drawn under'
  )

  started.stop()
})

test('startRum does not request remote configuration when it is disabled', async () => {
  const adapter = createAdapter()
  const requests: RequestOptions[] = []
  adapter.request = (options: RequestOptions) => {
    requests.push(options)
    return { abort: () => undefined }
  }
  const configuration = validateAndBuildRumConfiguration({
    clientToken: 'token',
    applicationId: 'app',
    remoteConfigurationEnabled: false,
    trackPages: false,
    trackActions: false,
    trackPerformance: false,
    flushInterval: 100000,
  })!

  const started = startRum(configuration, adapter)
  await Promise.resolve()

  assert.equal(requests.some((request) => request.url.includes('/api/v2/rum/config')), false)
  started.stop()
})
