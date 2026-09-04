import test from 'node:test'
import assert from 'node:assert/strict'
import { startRum } from '../packages/miniprogram-rum/src/boot/startRum'
import { validateAndBuildRumConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'
import { LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import type {
  PlatformAdapter,
  RequestOptions,
  UploadFileOptions,
  DownloadFileOptions,
} from '../packages/miniprogram-platform/src/platform/types'

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

let originalWxDescriptor: PropertyDescriptor | undefined
let originalPageDescriptor: PropertyDescriptor | undefined

test.beforeEach(() => {
  originalWxDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'wx')
  originalPageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Page')
  ;(globalThis as any).wx = {
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
    getPerformance: () => undefined,
  }
  ;(globalThis as any).Page = (options: Record<string, any>) => options
})

test.afterEach(() => {
  if (originalWxDescriptor) {
    Object.defineProperty(globalThis, 'wx', originalWxDescriptor)
  } else {
    delete (globalThis as any).wx
  }
  if (originalPageDescriptor) {
    Object.defineProperty(globalThis, 'Page', originalPageDescriptor)
  } else {
    delete (globalThis as any).Page
  }
})

test('startRum does not emit view events when trackPages is false', () => {
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
  try {
    started.startPage('manual-page')
    assert.equal(
      collected.some((event) => event.type === 'view'),
      false,
    )
  } finally {
    started.stop()
  }
})

test('startRum does not emit RUM events when session is sampled out', () => {
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
  try {
    started.addCustomEvent('sampled-out-event')
    assert.equal(collected.length, 0)
  } finally {
    started.stop()
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

test('remote sampling crossing from positive to zero expires the current session immediately', async () => {
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
    data: { schema_version: 1, version: 8, enabled: true, rum: { sessionSampleRate: 0 } },
  })
  assert.equal(
    collected.some((event) => event.type === 'resource' || event.type === 'error'),
    false,
  )
  assert.equal(started.sessionManager.findSession(), undefined)

  started.addCustomEvent('next-event-is-sampled-out')
  const nextSession = started.sessionManager.findSession()!
  assert.equal(nextSession.sessionSampleRate, 0)
  assert.equal(nextSession.rcVersion, 8)
  assert.equal(nextSession.isTracked, false)
  assert.equal(collected.length, 0)
  started.addCustomEvent('same-sampled-out-session')
  assert.equal(started.sessionManager.findSession()?.id, nextSession.id)
  assert.equal(collected.length, 0)
  assert.equal(requests.filter((request) => request.url.includes('/api/v2/rum/config')).length, 2)

  started.stop()
})

test('remote sampling crossing from zero to positive redraws on the next event', async () => {
  const originalRandom = Math.random
  try {
    for (const scenario of [
      { random: 0.1, tracked: true },
      { random: 0.9, tracked: false },
    ]) {
      Math.random = () => scenario.random
      const adapter = createAdapter()
      const observedRates: number[] = []
      let remoteRequest: RequestOptions | undefined
      adapter.request = (options: RequestOptions) => {
        if (options.url.includes('/api/v2/rum/config')) {
          remoteRequest = options
        }
        return { abort: () => undefined }
      }
      const configuration = validateAndBuildRumConfiguration({
        clientToken: 'token',
        applicationId: 'app',
        sessionSampleRate: 0,
        remoteConfigurationEnabled: true,
        beforeSampling: ({ sessionSampleRate }) => {
          observedRates.push(sessionSampleRate)
          return undefined
        },
        trackPages: false,
        trackActions: false,
        trackPerformance: false,
        flushInterval: 100000,
      })!
      const started = startRum(configuration, adapter)
      const collected: any[] = []
      started.lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => collected.push(event))

      try {
        await Promise.resolve()
        remoteRequest!.success?.({
          statusCode: 200,
          data: { schema_version: 1, version: 9, enabled: true, rum: { sessionSampleRate: 20 } },
        })
        assert.equal(started.sessionManager.findSession(), undefined)

        started.addCustomEvent('redraw-after-zero')
        const nextSession = started.sessionManager.findSession()!
        assert.equal(nextSession.sessionSampleRate, 20)
        assert.equal(nextSession.isTracked, scenario.tracked)
        assert.equal(collected.length, scenario.tracked ? 1 : 0)
        assert.deepEqual(observedRates, [0, 20])
      } finally {
        started.stop()
      }
    }
  } finally {
    Math.random = originalRandom
  }
})

test('positive-to-positive and zero-to-zero remote changes keep the current session', async () => {
  for (const scenario of [
    { initialRate: 100, remoteRate: 20 },
    { initialRate: 0, remoteRate: 0 },
  ]) {
    const adapter = createAdapter()
    let remoteRequest: RequestOptions | undefined
    adapter.request = (options: RequestOptions) => {
      if (options.url.includes('/api/v2/rum/config')) {
        remoteRequest = options
      }
      return { abort: () => undefined }
    }
    const configuration = validateAndBuildRumConfiguration({
      clientToken: 'token',
      applicationId: 'app',
      sessionSampleRate: scenario.initialRate,
      remoteConfigurationEnabled: true,
      trackPages: false,
      trackActions: false,
      trackPerformance: false,
      flushInterval: 100000,
    })!
    const started = startRum(configuration, adapter)
    try {
      const currentSessionId = started.sessionManager.findSession()!.id
      await Promise.resolve()
      remoteRequest!.success?.({
        statusCode: 200,
        data: {
          schema_version: 1,
          version: 10,
          enabled: true,
          rum: { sessionSampleRate: scenario.remoteRate },
        },
      })
      assert.equal(started.sessionManager.findSession()!.id, currentSessionId)
      assert.equal(started.sessionManager.findSession()!.sessionSampleRate, scenario.initialRate)
    } finally {
      started.stop()
    }
  }
})

test('a current forced session is the exception to a positive-to-zero transition', async () => {
  const adapter = createAdapter()
  let remoteRequest: RequestOptions | undefined
  adapter.request = (options: RequestOptions) => {
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

  try {
    await Promise.resolve()
    started.sessionManager.setForcedSession()
    started.sessionManager.expire()
    started.addCustomEvent('create-forced-session')
    const forcedSession = started.sessionManager.findSession()!
    assert.equal(forcedSession.isForced, true)

    remoteRequest!.success?.({
      statusCode: 200,
      data: { schema_version: 1, version: 11, enabled: true, rum: { sessionSampleRate: 0 } },
    })
    assert.equal(started.sessionManager.findSession()!.id, forcedSession.id)
  } finally {
    started.stop()
  }
})

test('a pending forced marker survives a positive-to-zero transition', async () => {
  const adapter = createAdapter()
  let remoteRequest: RequestOptions | undefined
  adapter.request = (options: RequestOptions) => {
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

  try {
    await Promise.resolve()
    started.sessionManager.setForcedSession()
    remoteRequest!.success?.({
      statusCode: 200,
      data: { schema_version: 1, version: 12, enabled: true, rum: { sessionSampleRate: 0 } },
    })
    assert.equal(started.sessionManager.findSession(), undefined)

    started.addCustomEvent('forced-after-transition')
    const forcedSession = started.sessionManager.findSession()!
    assert.equal(forcedSession.sessionSampleRate, 0)
    assert.equal(forcedSession.isForced, true)
    assert.equal(forcedSession.isTracked, true)
  } finally {
    started.stop()
  }
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
    data: { schema_version: 1, version: 4, enabled: true, rum: { sessionSampleRate: 100 } },
  })

  started.sessionManager.expire()
  started.addCustomEvent('draws-a-new-session')

  assert.equal(configRequests.length, 2, 'a renewed session must ask for the configuration again')
  assert.ok(
    configRequests[1].url.includes('applied_version=4'),
    'the new request reports the version the renewed session was drawn under',
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

  assert.equal(
    requests.some((request) => request.url.includes('/api/v2/rum/config')),
    false,
  )
  started.stop()
})
