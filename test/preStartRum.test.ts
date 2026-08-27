import test from 'node:test'
import assert from 'node:assert/strict'
import { createPreStartStrategy } from '../packages/miniprogram-rum/src/boot/preStartRum'
import { startRum } from '../packages/miniprogram-rum/src/boot/startRum'
import type { RumPublicApi, Strategy } from '../packages/miniprogram-rum/src/boot/rumPublicApi'
import type { RumInitConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'
import type {
  DownloadFileOptions,
  PlatformAdapter,
  RequestOptions,
  UploadFileOptions,
} from '../packages/miniprogram-platform/src/platform/types'

type TestAdapter = PlatformAdapter & { configRequests: RequestOptions[] }

function createAdapter(): TestAdapter {
  const storage = new Map<string, unknown>()
  const adapter: TestAdapter = {
    configRequests: [],
    request: (options: RequestOptions) => {
      if (options.url.includes('/api/v2/rum/config')) {
        adapter.configRequests.push(options)
      }
      return { abort: () => undefined }
    },
    uploadFile: (options: UploadFileOptions) => {
      options.success?.({ statusCode: 200, data: 'ok' })
      return { abort: () => undefined }
    },
    downloadFile: (options: DownloadFileOptions) => {
      options.success?.({ statusCode: 200, tempFilePath: '/tmp/file' })
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
  return adapter
}

/** startRum instruments the miniprogram globals, which do not exist under Node. */
function withPlatformGlobals(body: () => void | Promise<void>) {
  const globals = globalThis as any
  const originalWx = globals.wx
  const originalPage = globals.Page
  globals.wx = { getPerformance: () => undefined }
  globals.Page = (options: Record<string, any>) => options

  const restore = () => {
    globals.wx = originalWx
    globals.Page = originalPage
  }

  let result: void | Promise<void>
  try {
    result = body()
  } catch (error) {
    restore()
    throw error
  }
  if (result instanceof Promise) {
    return result.finally(restore)
  }
  restore()
  return undefined
}

/** Mirrors makeRumPublicApi with an injected adapter so tests avoid platform globals. */
function createTestApi(adapter: TestAdapter) {
  let started: ReturnType<typeof startRum> | undefined
  let strategy: Strategy = createPreStartStrategy(adapter, (configuration, adapterInstance) => {
    started = startRum(configuration, adapterInstance)
    const nextStrategy: Strategy = {
      init: () => undefined,
      initConfiguration: strategy.initConfiguration,
      addAction: started.addAction,
      addError: started.addError,
      addTiming: started.addTiming,
      addCustomEvent: started.addCustomEvent,
      setGlobalContext: (context) => started!.globalContext.setContext(context),
      setUser: (context) => started!.userContext.setContext(context),
      startPage: started.startPage,
      stopSession: () => started!.sessionManager.expire(),
      setForcedSession: started.sessionManager.setForcedSession,
      getRemoteConfig: started.getRemoteConfig,
      getInitConfiguration: () => strategy.initConfiguration,
    }
    strategy = nextStrategy
    return nextStrategy
  })

  const api = {
    init: (initConfiguration: RumInitConfiguration) => strategy.init(initConfiguration, api as RumPublicApi),
    setForcedSession: () => strategy.setForcedSession(),
    getRemoteConfig: () => strategy.getRemoteConfig(),
    getStarted: () => started!,
  }
  return api
}

const baseConfiguration: RumInitConfiguration = {
  clientToken: 'token',
  applicationId: 'app',
  trackPages: false,
  trackActions: false,
  trackPerformance: false,
  flushInterval: 100_000,
}

test('getRemoteConfig returns undefined before init and the fetched custom afterwards', () =>
  withPlatformGlobals(async () => {
    const adapter = createAdapter()
    const api = createTestApi(adapter)

    assert.equal(api.getRemoteConfig(), undefined)

    api.init({ ...baseConfiguration, remoteConfigurationEnabled: true })
    assert.equal(api.getRemoteConfig(), undefined)

    await Promise.resolve()
    assert.equal(adapter.configRequests.length, 1)
    adapter.configRequests[0].success?.({
      statusCode: 200,
      data: { version: 3, enabled: true, rum: { sessionSampleRate: 100 }, custom: { tier: 'gold' } },
    })

    assert.deepEqual(api.getRemoteConfig(), { tier: 'gold' })
    api.getStarted().stop()
  }))

test('getRemoteConfig returns undefined when remote configuration is disabled', () =>
  withPlatformGlobals(() => {
    const adapter = createAdapter()
    const api = createTestApi(adapter)

    api.init({ ...baseConfiguration, remoteConfigurationEnabled: false })

    assert.equal(api.getRemoteConfig(), undefined)
    api.getStarted().stop()
  }))

test('setForcedSession before init applies to the session after the first one', () =>
  withPlatformGlobals(() => {
    const adapter = createAdapter()
    const api = createTestApi(adapter)

    api.setForcedSession()
    api.init({ ...baseConfiguration, sessionSampleRate: 0 })

    const started = api.getStarted()
    // The first session is created inside startRum, before the pre-start buffer
    // is replayed, so a queued call must not retroactively change its draw.
    assert.equal(started.sessionManager.findSession()?.isTracked, false)

    started.sessionManager.expire()
    assert.equal(started.sessionManager.renew().isTracked, true)

    started.sessionManager.expire()
    assert.equal(started.sessionManager.renew().isTracked, false)
    started.stop()
  }))

test('setForcedSession after init leaves the current session and forces the next one', () =>
  withPlatformGlobals(() => {
    const adapter = createAdapter()
    const api = createTestApi(adapter)

    api.init({ ...baseConfiguration, sessionSampleRate: 0 })
    const started = api.getStarted()
    const current = started.sessionManager.findSession()!
    assert.equal(current.isTracked, false)

    api.setForcedSession()
    assert.equal(started.sessionManager.findSession()?.id, current.id)
    assert.equal(started.sessionManager.findSession()?.isTracked, false)

    started.sessionManager.expire()
    assert.equal(started.sessionManager.renew().isTracked, true)
    started.stop()
  }))

test('beforeSampling receives the remote sample rate and custom of the next session', () =>
  withPlatformGlobals(async () => {
    const adapter = createAdapter()
    const contexts: Array<{ sessionSampleRate: number; custom: Record<string, unknown> | null }> = []
    const api = createTestApi(adapter)

    api.init({
      ...baseConfiguration,
      sessionSampleRate: 100,
      remoteConfigurationEnabled: true,
      beforeSampling: (context) => {
        contexts.push(context)
        return context.custom?.tier === 'gold' ? 100 : 0
      },
    })

    const started = api.getStarted()
    assert.deepEqual(contexts, [{ sessionSampleRate: 100, custom: null }])
    assert.equal(started.sessionManager.findSession()?.isTracked, false)

    await Promise.resolve()
    adapter.configRequests[0].success?.({
      statusCode: 200,
      data: { version: 4, enabled: true, rum: { sessionSampleRate: 10 }, custom: { tier: 'gold' } },
    })

    started.sessionManager.expire()
    const next = started.sessionManager.renew()

    assert.deepEqual(contexts[1], { sessionSampleRate: 10, custom: { tier: 'gold' } })
    assert.equal(next.sessionSampleRate, 100)
    assert.equal(next.isTracked, true)
    assert.equal(next.rcVersion, 4)
    started.stop()
  }))
