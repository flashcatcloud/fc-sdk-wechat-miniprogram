import test from 'node:test'
import assert from 'node:assert/strict'
import type {
  DownloadFileOptions,
  PlatformAdapter,
  RequestOptions,
  UploadFileOptions,
} from '../packages/miniprogram-platform/src/platform/types'
import { isInternalRequest } from '../packages/miniprogram-platform/src/platform/internalRequest'
import { validateAndBuildRumConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'
import {
  createRemoteConfigurationController,
  REMOTE_CONFIGURATION_STORAGE_KEY_PREFIX,
} from '../packages/miniprogram-rum/src/domain/configuration/remoteConfiguration'

type TestAdapter = PlatformAdapter & {
  requests: RequestOptions[]
  storage: Map<string, unknown>
  storageReads: number
}

function createAdapter(
  onRequest?: (options: RequestOptions) => void,
  storage = new Map<string, unknown>(),
): TestAdapter {
  const adapter: TestAdapter = {
    requests: [],
    storage,
    storageReads: 0,
    request: (options) => {
      adapter.requests.push(options)
      onRequest?.(options)
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
    setStorageSync: (key, value) => storage.set(key, value),
    getStorageSync: (key) => {
      adapter.storageReads += 1
      return storage.get(key)
    },
    removeStorageSync: (key) => storage.delete(key),
    getSystemInfoSync: () => ({}),
    getNetworkType: ({ success }) => success({ networkType: 'wifi' }),
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

function configuration(overrides: Record<string, unknown> = {}) {
  return validateAndBuildRumConfiguration({
    clientToken: 'token value',
    applicationId: 'app-id',
    sessionSampleRate: 73,
    remoteConfigurationEnabled: true,
    env: 'prod cn',
    version: '1.2.3',
    ...overrides,
  })!
}

test('remote configuration requires schema v1 and only consumes sessionSampleRate and custom', () => {
  const cases = [
    {
      name: 'schema v1 with unknown keys',
      data: {
        schema_version: 1,
        version: 3,
        enabled: true,
        rum: { sessionSampleRate: 22, traceSampleRate: 0, privacyLevel: 'mask' },
        custom: { anything: true },
      },
      expected: { sessionSampleRate: 22, rcVersion: 3, custom: { anything: true } },
    },
    {
      name: 'missing sampling field',
      data: { schema_version: 1, version: 4, enabled: true, rum: { traceSampleRate: 0 } },
      expected: { sessionSampleRate: 73, rcVersion: 4, custom: null },
    },
  ]

  for (const scenario of cases) {
    const adapter = createAdapter((options) => options.success?.({ statusCode: 200, data: scenario.data }))
    const controller = createRemoteConfigurationController(adapter, configuration())
    controller.fetch()
    assert.deepEqual(controller.getSessionConfiguration(), scenario.expected, scenario.name)
    controller.stop()
  }
})

test('remote configuration logs fetched and applied values when debug is enabled', () => {
  const data = {
    schema_version: 1,
    version: 6,
    enabled: true,
    rum: { sessionSampleRate: 35, traceSampleRate: 10 },
  }
  const adapter = createAdapter((options) =>
    options.success?.({
      statusCode: 200,
      data,
      header: { ETag: '"config-6"' },
    }),
  )
  const debugConfiguration = configuration()
  debugConfiguration.debug = true
  const originalLog = console.log
  const logs: unknown[][] = []
  console.log = (...args: unknown[]) => logs.push(args)

  try {
    const controller = createRemoteConfigurationController(adapter, debugConfiguration)
    controller.fetch()

    assert.deepEqual(logs, [
      [
        '[FlashCat RUM][Debug] Remote configuration fetched',
        {
          response: data,
          applied: { sessionSampleRate: 35, rcVersion: 6, custom: null },
          etag: '"config-6"',
        },
      ],
    ])
    controller.stop()
  } finally {
    console.log = originalLog
  }
})

test('debug failure logs include status and category without request credentials', () => {
  const adapter = createAdapter((options) => options.success?.({ statusCode: 403 }))
  const debugConfiguration = configuration()
  debugConfiguration.debug = true
  const originalLog = console.log
  const logs: unknown[][] = []
  console.log = (...args: unknown[]) => logs.push(args)

  try {
    const controller = createRemoteConfigurationController(adapter, debugConfiguration)
    controller.fetch()

    assert.deepEqual(logs, [['[FlashCat RUM][Debug] Remote configuration request failed', { statusCode: 403 }]])
    assert.equal(JSON.stringify(logs).includes('token value'), false)
    assert.equal(JSON.stringify(logs).includes('/api/v2/rum/config'), false)
    controller.stop()
  } finally {
    console.log = originalLog
  }
})

test('remote configuration rejects incompatible or malformed snapshots as a whole', () => {
  const invalidResponses = [
    {},
    { version: 2, enabled: true, rum: { sessionSampleRate: 10 } },
    { schema_version: 2, version: 2, enabled: true, rum: { sessionSampleRate: 10 } },
    { schema_version: '1', version: 2, enabled: true, rum: { sessionSampleRate: 10 } },
    { schema_version: 1, enabled: true, rum: { sessionSampleRate: 10 } },
    { schema_version: 1, version: 2, rum: { sessionSampleRate: 10 } },
    { schema_version: 1, version: 2, enabled: true, rum: { sessionSampleRate: -1 } },
    { schema_version: 1, version: 2, enabled: true, rum: { sessionSampleRate: 101 } },
    { schema_version: 1, version: 2, enabled: true, rum: { sessionSampleRate: Number.NaN } },
    { schema_version: 1, version: 2, enabled: true, rum: { sessionSampleRate: Number.POSITIVE_INFINITY } },
    { schema_version: 1, version: 2, enabled: true, rum: { sessionSampleRate: '10' } },
    { schema_version: 1, version: '2', enabled: true, rum: { sessionSampleRate: 10 } },
    '{broken json',
  ]

  for (const data of invalidResponses) {
    const adapter = createAdapter((options) => options.success?.({ statusCode: 200, data }))
    const controller = createRemoteConfigurationController(adapter, configuration(), {
      setTimeout: () => 1,
    })
    controller.fetch()
    assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 73, rcVersion: 0, custom: null })
    controller.stop()
  }
})

test('a malformed newer response preserves the last accepted snapshot', () => {
  let response: unknown = {
    schema_version: 1,
    version: 5,
    enabled: true,
    rum: { sessionSampleRate: 25 },
    custom: { tier: 'gold' },
  }
  const adapter = createAdapter((options) => options.success?.({ statusCode: 200, data: response }))
  const controller = createRemoteConfigurationController(adapter, configuration(), { setTimeout: () => 1 })
  controller.fetch()

  response = { schema_version: 1, version: 6, enabled: true, rum: { sessionSampleRate: 'invalid' } }
  controller.fetch(5)

  assert.deepEqual(controller.getSessionConfiguration(), {
    sessionSampleRate: 25,
    rcVersion: 5,
    custom: { tier: 'gold' },
  })
  controller.stop()
})

test('enabled false clears cache and falls back to the initialization rate', () => {
  const storage = new Map<string, unknown>()
  let response: unknown = { schema_version: 1, version: 7, enabled: true, rum: { sessionSampleRate: 12 } }
  const adapter = createAdapter((options) => options.success?.({ statusCode: 200, data: response }), storage)
  const controller = createRemoteConfigurationController(adapter, configuration())
  controller.fetch()
  assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 12, rcVersion: 7, custom: null })
  assert.equal(storage.size, 2)

  response = { schema_version: 1, version: 8, enabled: false, rum: { sessionSampleRate: 0 } }
  controller.fetch(7)
  // Every knob goes back to the initialization value, but the version that switched it off is
  // kept: it is what the next request echoes as applied_version, and without it the console cannot
  // tell a client that took the kill switch from one that never heard about it.
  assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 73, rcVersion: 8, custom: null })
  // And it is written, not merely held: a miniprogram process is reclaimed readily, and a version
  // that lived only in memory would be gone on the next launch — leaving the console unable to tell
  // this client from one that never heard about the change.
  const relaunched = createRemoteConfigurationController(
    createAdapter(() => undefined, storage),
    configuration(),
  )
  assert.equal(relaunched.getSessionConfiguration().rcVersion, 8, 'the version survives a relaunch')
  assert.equal(relaunched.getSessionConfiguration().sessionSampleRate, 73, 'the knobs stay at initialization')
  relaunched.stop()
  controller.stop()
})

test('cache is loaded synchronously with ETag and 304 preserves the snapshot', () => {
  const storage = new Map<string, unknown>()
  const firstAdapter = createAdapter(
    (options) =>
      options.success?.({
        statusCode: 200,
        data: { schema_version: 1, version: 9, enabled: true, rum: { sessionSampleRate: 31 } },
        header: { ETag: '"config-9"' },
      }),
    storage,
  )
  const first = createRemoteConfigurationController(firstAdapter, configuration())
  first.fetch()
  first.stop()

  const secondAdapter = createAdapter((options) => options.success?.({ statusCode: 304 }), storage)
  const second = createRemoteConfigurationController(secondAdapter, configuration())
  assert.deepEqual(second.getSessionConfiguration(), { sessionSampleRate: 31, rcVersion: 9, custom: null })
  second.fetch(9)
  assert.equal(secondAdapter.requests[0].header?.['If-None-Match'], '"config-9"')
  assert.deepEqual(second.getSessionConfiguration(), { sessionSampleRate: 31, rcVersion: 9, custom: null })
  second.stop()
})

test('cache dimensions isolate endpoint, application, env and app version', () => {
  const storage = new Map<string, unknown>()
  const sourceAdapter = createAdapter(
    (options) =>
      options.success?.({
        statusCode: 200,
        data: { schema_version: 1, version: 5, enabled: true, rum: { sessionSampleRate: 25 } },
      }),
    storage,
  )
  const source = createRemoteConfigurationController(sourceAdapter, configuration())
  source.fetch()
  source.stop()

  const variants = [
    { site: 'other.flashcat.cloud' },
    { applicationId: 'other-app' },
    { env: 'staging' },
    { version: '2.0.0' },
  ]
  for (const variant of variants) {
    const controller = createRemoteConfigurationController(createAdapter(undefined, storage), configuration(variant))
    assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 73, rcVersion: 0, custom: null })
    controller.stop()
  }
})

test('cache cleanup removes the previous app version and ignores dynamic function proxy parameters', () => {
  const storage = new Map<string, unknown>()
  let proxyCall = 0
  const proxy = ({ path, parameters }: { path: string; parameters: string }) => {
    proxyCall += 1
    return `https://proxy.example.com${path}?signature=${proxyCall}&${parameters}#runtime`
  }
  const firstAdapter = createAdapter(
    (options) =>
      options.success?.({
        statusCode: 200,
        data: { schema_version: 1, version: 5, enabled: true, rum: { sessionSampleRate: 25 } },
      }),
    storage,
  )
  const first = createRemoteConfigurationController(firstAdapter, configuration({ proxy }))
  first.fetch()
  first.stop()

  const firstCacheKey = [...storage.keys()].find((key) => key.startsWith(REMOTE_CONFIGURATION_STORAGE_KEY_PREFIX))
  assert.ok(firstCacheKey)

  const secondAdapter = createAdapter(
    (options) =>
      options.success?.({
        statusCode: 200,
        data: { schema_version: 1, version: 6, enabled: true, rum: { sessionSampleRate: 30 } },
      }),
    storage,
  )
  const second = createRemoteConfigurationController(secondAdapter, configuration({ proxy, version: '2.0.0' }))

  assert.equal(storage.has(firstCacheKey), false)
  assert.deepEqual(second.getSessionConfiguration(), { sessionSampleRate: 73, rcVersion: 0, custom: null })
  second.fetch()
  assert.deepEqual(second.getSessionConfiguration(), { sessionSampleRate: 30, rcVersion: 6, custom: null })
  assert.equal([...storage.keys()].filter((key) => key.startsWith(REMOTE_CONFIGURATION_STORAGE_KEY_PREFIX)).length, 1)
  second.stop()
})

test('corrupt or incompatible cache is removed and storage failures are isolated', () => {
  const storage = new Map<string, unknown>()
  const seedAdapter = createAdapter(
    (options) =>
      options.success?.({
        statusCode: 200,
        data: { schema_version: 1, version: 1, enabled: true, rum: { sessionSampleRate: 20 } },
      }),
    storage,
  )
  const seed = createRemoteConfigurationController(seedAdapter, configuration())
  seed.fetch()
  seed.stop()
  const cacheKey = [...storage.keys()].find((key) => key.startsWith(REMOTE_CONFIGURATION_STORAGE_KEY_PREFIX))!
  assert.ok(cacheKey)
  storage.set(cacheKey, '{not json')

  const controller = createRemoteConfigurationController(createAdapter(undefined, storage), configuration())
  assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 73, rcVersion: 0, custom: null })
  assert.equal(storage.has(cacheKey), false)
  controller.stop()

  const throwingAdapter = createAdapter((options) =>
    options.success?.({
      statusCode: 200,
      data: { schema_version: 1, version: 2, enabled: true, rum: { sessionSampleRate: 19 } },
    }),
  )
  throwingAdapter.getStorageSync = () => {
    throw new Error('read failed')
  }
  throwingAdapter.setStorageSync = () => {
    throw new Error('write failed')
  }
  throwingAdapter.removeStorageSync = () => {
    throw new Error('remove failed')
  }
  const storageFailure = createRemoteConfigurationController(throwingAdapter, configuration())
  assert.doesNotThrow(() => storageFailure.fetch())
  assert.deepEqual(storageFailure.getSessionConfiguration(), { sessionSampleRate: 19, rcVersion: 2, custom: null })
  storageFailure.stop()
})

test('disabled remote configuration performs no cache access and no request', () => {
  const adapter = createAdapter()
  const controller = createRemoteConfigurationController(adapter, configuration({ remoteConfigurationEnabled: false }))
  controller.fetch(3)

  assert.equal(adapter.storageReads, 0)
  assert.equal(adapter.requests.length, 0)
  assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 73, rcVersion: 0, custom: null })
  assert.equal(controller.getRemoteConfig(), undefined)
})

test('custom survives a cold start through the cache and 304 keeps the cached value', () => {
  const storage = new Map<string, unknown>()
  const firstAdapter = createAdapter(
    (options) =>
      options.success?.({
        statusCode: 200,
        data: {
          schema_version: 1,
          version: 20,
          enabled: true,
          rum: { sessionSampleRate: 44 },
          custom: { supportUsers: ['u-1'], featureFlags: { newCart: true } },
        },
        header: { ETag: '"config-20"' },
      }),
    storage,
  )
  const first = createRemoteConfigurationController(firstAdapter, configuration())
  assert.equal(first.getRemoteConfig(), undefined)
  first.fetch()
  assert.deepEqual(first.getRemoteConfig(), { supportUsers: ['u-1'], featureFlags: { newCart: true } })
  first.stop()

  const secondAdapter = createAdapter((options) => options.success?.({ statusCode: 304 }), storage)
  const second = createRemoteConfigurationController(secondAdapter, configuration())
  assert.deepEqual(second.getRemoteConfig(), { supportUsers: ['u-1'], featureFlags: { newCart: true } })
  second.fetch(20)
  assert.deepEqual(second.getSessionConfiguration(), {
    sessionSampleRate: 44,
    rcVersion: 20,
    custom: { supportUsers: ['u-1'], featureFlags: { newCart: true } },
  })
  second.stop()
})

test('a 200 response without custom clears the previously applied custom', () => {
  let response: unknown = {
    schema_version: 1,
    version: 21,
    enabled: true,
    rum: { sessionSampleRate: 40 },
    custom: { tier: 'gold' },
  }
  const adapter = createAdapter((options) => options.success?.({ statusCode: 200, data: response }))
  const controller = createRemoteConfigurationController(adapter, configuration())
  controller.fetch()
  assert.deepEqual(controller.getRemoteConfig(), { tier: 'gold' })

  response = { schema_version: 1, version: 22, enabled: true, rum: { sessionSampleRate: 40 } }
  controller.fetch(21)
  assert.equal(controller.getRemoteConfig(), undefined)
  assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 40, rcVersion: 22, custom: null })
  controller.stop()
})

test('the kill switch clears custom while persisting its version', () => {
  const storage = new Map<string, unknown>()
  let response: unknown = {
    schema_version: 1,
    version: 23,
    enabled: true,
    rum: { sessionSampleRate: 40 },
    custom: { tier: 'gold' },
  }
  const adapter = createAdapter((options) => options.success?.({ statusCode: 200, data: response }), storage)
  const controller = createRemoteConfigurationController(adapter, configuration())
  controller.fetch()
  assert.deepEqual(controller.getRemoteConfig(), { tier: 'gold' })

  response = { schema_version: 1, version: 24, enabled: false }
  controller.fetch(23)
  assert.equal(controller.getRemoteConfig(), undefined)
  assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 73, rcVersion: 24, custom: null })
  controller.stop()
})

test('a schema this build cannot read is a settled answer, not something to retry', () => {
  // Told apart from an unreadable body on purpose: asking again would fetch the same refusal.
  let requests = 0
  const timers: Array<() => void> = []
  const adapter = createAdapter((options) => {
    requests += 1
    options.success?.({ statusCode: 200, data: { schema_version: 2, version: 5, enabled: true, rum: {} } })
  })
  const controller = createRemoteConfigurationController(adapter, configuration(), {
    setTimeout: (callback) => {
      timers.push(callback)
      return timers.length
    },
    clearTimeout: () => undefined,
  })

  controller.fetch()

  assert.equal(requests, 1)
  assert.equal(timers.length, 0, 'a refusal this definite must not be retried')
  assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 73, rcVersion: 0, custom: null })
  controller.stop()
})

test('one configuration request at a time, however many triggers arrive', () => {
  // Start-up and a session renewal can land together on a cold start.
  let requests = 0
  let settle: (() => void) | undefined
  const adapter = createAdapter((options) => {
    requests += 1
    settle = () =>
      options.success?.({
        statusCode: 200,
        data: { schema_version: 1, version: 3, enabled: true, rum: { sessionSampleRate: 9 } },
      })
  })
  const controller = createRemoteConfigurationController(adapter, configuration())

  controller.fetch()
  controller.fetch(0)
  assert.equal(requests, 1, 'the second trigger must join the request already in flight')

  settle?.()
  controller.fetch(3)
  assert.equal(requests, 2, 'once the first answer lands, the next trigger asks again')
  controller.stop()
})

test('a non-object custom is ignored without affecting session sampling', () => {
  for (const custom of ['text', 42, true, null, ['a'], undefined]) {
    const adapter = createAdapter((options) =>
      options.success?.({
        statusCode: 200,
        data: { schema_version: 1, version: 25, enabled: true, rum: { sessionSampleRate: 41 }, custom },
      }),
    )
    const controller = createRemoteConfigurationController(adapter, configuration())
    controller.fetch()
    assert.equal(controller.getRemoteConfig(), undefined, `custom ${JSON.stringify(custom)}`)
    assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 41, rcVersion: 25, custom: null })
    controller.stop()
  }
})

test('custom accessors return defensive copies that cannot mutate internal state', () => {
  const adapter = createAdapter((options) =>
    options.success?.({
      statusCode: 200,
      data: {
        schema_version: 1,
        version: 26,
        enabled: true,
        rum: { sessionSampleRate: 40 },
        custom: { nested: { tier: 'gold' } },
      },
    }),
  )
  const controller = createRemoteConfigurationController(adapter, configuration())
  controller.fetch()

  const first = controller.getRemoteConfig()!
  const second = controller.getRemoteConfig()!
  assert.notEqual(first, second)
  assert.notEqual(first.nested, second.nested)

  first.injected = true
  ;(first.nested as Record<string, unknown>).tier = 'bronze'
  assert.deepEqual(controller.getRemoteConfig(), { nested: { tier: 'gold' } })

  const snapshot = controller.getSessionConfiguration()
  snapshot.custom!.injected = true
  assert.deepEqual(controller.getSessionConfiguration().custom, { nested: { tier: 'gold' } })
  controller.stop()
})

test('a cache written before custom existed stays usable while getRemoteConfig returns undefined', () => {
  const storage = new Map<string, unknown>()
  const seedAdapter = createAdapter(
    (options) =>
      options.success?.({
        statusCode: 200,
        data: { schema_version: 1, version: 27, enabled: true, rum: { sessionSampleRate: 33 } },
      }),
    storage,
  )
  const seed = createRemoteConfigurationController(seedAdapter, configuration())
  seed.fetch()
  seed.stop()

  // Rewrite the v2 cache as if custom had not been added yet.
  const cacheKey = [...storage.keys()].find((key) => key.startsWith(REMOTE_CONFIGURATION_STORAGE_KEY_PREFIX))!
  storage.set(
    cacheKey,
    JSON.stringify({
      formatVersion: 2,
      sessionSampleRate: 33,
      rcVersion: 27,
      etag: '"config-27"',
    }),
  )

  const controller = createRemoteConfigurationController(createAdapter(undefined, storage), configuration())
  assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 33, rcVersion: 27, custom: null })
  assert.equal(controller.getRemoteConfig(), undefined)
  controller.stop()
})

test('v2 cache stores only remote overrides so a new initialization rate is not frozen', () => {
  const storage = new Map<string, unknown>()
  let response: unknown = {
    schema_version: 1,
    version: 30,
    enabled: true,
    rum: { sessionSampleRate: 0 },
  }
  const adapter = createAdapter((options) => options.success?.({ statusCode: 200, data: response }), storage)
  const controller = createRemoteConfigurationController(adapter, configuration())
  controller.fetch()
  assert.equal(controller.getSessionConfiguration().sessionSampleRate, 0)

  response = { schema_version: 1, version: 31, enabled: true, rum: {} }
  controller.fetch(30)
  assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 73, rcVersion: 31, custom: null })
  controller.stop()

  const cacheKey = [...storage.keys()].find((key) => key.startsWith(REMOTE_CONFIGURATION_STORAGE_KEY_PREFIX))!
  const cached = JSON.parse(storage.get(cacheKey) as string)
  assert.equal('sessionSampleRate' in cached, false)

  const relaunched = createRemoteConfigurationController(
    createAdapter(undefined, storage),
    configuration({ sessionSampleRate: 91 }),
  )
  assert.deepEqual(relaunched.getSessionConfiguration(), { sessionSampleRate: 91, rcVersion: 31, custom: null })
  relaunched.stop()
})

test('legacy v1 cache is ignored and removed instead of freezing its effective rate', () => {
  const storage = new Map<string, unknown>()
  const probe = createRemoteConfigurationController(createAdapter(undefined, storage), configuration())
  probe.stop()

  const currentIndexKey = [...storage.keys()].find((key) => key.includes('_index_v2_'))!
  const currentCacheKey = storage.get(currentIndexKey) as string
  const legacyIndexKey = currentIndexKey.replace('_index_v2_', '_index_v1_')
  const legacyCacheKey = currentCacheKey.replace('_config_v2_', '_config_v1_')
  storage.set(legacyIndexKey, legacyCacheKey)
  storage.set(
    legacyCacheKey,
    JSON.stringify({
      formatVersion: 1,
      snapshot: { sessionSampleRate: 12, rcVersion: 8, custom: null },
      etag: '"legacy"',
    }),
  )

  const controller = createRemoteConfigurationController(createAdapter(undefined, storage), configuration())
  assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 73, rcVersion: 0, custom: null })
  assert.equal(storage.has(legacyCacheKey), false)
  assert.equal(storage.has(legacyIndexKey), false)
  controller.stop()
})

test('only changes crossing zero notify the session lifecycle', () => {
  const responses = [
    { schema_version: 1, version: 1, enabled: true, rum: { sessionSampleRate: 20 } },
    { schema_version: 1, version: 2, enabled: true, rum: { sessionSampleRate: 0 } },
    { schema_version: 1, version: 3, enabled: true, rum: { sessionSampleRate: 30 } },
    { schema_version: 1, version: 4, enabled: true, rum: { sessionSampleRate: 40 } },
  ]
  const adapter = createAdapter((options) => {
    options.success?.({ statusCode: 200, data: responses.shift() })
  })
  const controller = createRemoteConfigurationController(adapter, configuration())
  const changes: Array<[number, number]> = []
  controller.setSessionSampleRateChangeHandler((previous, next) => changes.push([previous, next]))

  controller.fetch()
  controller.fetch(1)
  controller.fetch(2)
  controller.fetch(3)

  assert.deepEqual(changes, [
    [20, 0],
    [0, 30],
  ])
  controller.stop()
})

test('a kill switch or removed override also notifies when its effective fallback crosses zero', () => {
  const responses = [
    { schema_version: 1, version: 1, enabled: true, rum: { sessionSampleRate: 0 } },
    { schema_version: 1, version: 2, enabled: false },
    { schema_version: 1, version: 3, enabled: true, rum: { sessionSampleRate: 0 } },
    { schema_version: 1, version: 4, enabled: true, rum: {} },
  ]
  const adapter = createAdapter((options) => options.success?.({ statusCode: 200, data: responses.shift() }))
  const controller = createRemoteConfigurationController(adapter, configuration())
  const changes: Array<[number, number]> = []
  controller.setSessionSampleRateChangeHandler((previous, next) => changes.push([previous, next]))

  for (let version = 0; version < 4; version += 1) {
    controller.fetch(version)
  }

  assert.deepEqual(changes, [
    [73, 0],
    [0, 73],
    [73, 0],
    [0, 73],
  ])
  controller.stop()
})

test('an applied version raises the floor and a stale response cannot overwrite configuration or ETag', () => {
  const requests: RequestOptions[] = []
  const storage = new Map<string, unknown>()
  const controller = createRemoteConfigurationController(
    createAdapter((options) => requests.push(options), storage),
    configuration(),
  )

  controller.fetch(5)
  controller.fetch(9)
  assert.equal(requests.length, 1)
  requests[0].success?.({
    statusCode: 200,
    data: { schema_version: 1, version: 8, enabled: true, rum: { sessionSampleRate: 0 } },
    header: { ETag: '"stale"' },
  })
  assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 73, rcVersion: 0, custom: null })

  controller.fetch(9)
  assert.equal(requests.length, 2)
  assert.equal(requests[1].header?.['If-None-Match'], undefined)
  requests[1].success?.({
    statusCode: 200,
    data: { schema_version: 1, version: 9, enabled: true, rum: { sessionSampleRate: 25 } },
    header: { ETag: '"current"' },
  })
  assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 25, rcVersion: 9, custom: null })
  controller.stop()
})

test('complete without success or fail schedules one retry and keeps the chain deduplicated', () => {
  const scheduled: Array<() => void> = []
  const adapter = createAdapter()
  adapter.request = (options) => {
    adapter.requests.push(options)
    return { abort: () => undefined }
  }
  const controller = createRemoteConfigurationController(adapter, configuration(), {
    random: () => 0.5,
    setTimeout: (callback) => {
      scheduled.push(callback)
      return scheduled.length
    },
  })

  controller.fetch()
  adapter.requests[0].complete?.()
  controller.fetch(1)
  assert.equal(adapter.requests.length, 1)
  assert.equal(scheduled.length, 1)

  scheduled[0]()
  assert.equal(adapter.requests.length, 2)
  controller.stop()
})

test('direct request contains complete parameters, applied version and internal marker', () => {
  const adapter = createAdapter((options) =>
    options.success?.({
      statusCode: 200,
      data: { schema_version: 1, version: 12, enabled: true, rum: { sessionSampleRate: 40 } },
    }),
  )
  const controller = createRemoteConfigurationController(adapter, configuration({ site: 'rum.example.com' }))
  controller.fetch(11)

  const request = adapter.requests[0]
  const url = new URL(request.url)
  assert.equal(url.origin + url.pathname, 'https://rum.example.com/api/v2/rum/config')
  assert.equal(url.searchParams.get('client_token'), 'token value')
  assert.equal(url.searchParams.get('sdk'), 'miniprogram')
  assert.ok(url.searchParams.get('sdk_version'))
  assert.equal(url.searchParams.get('env'), 'prod cn')
  assert.equal(url.searchParams.get('app_version'), '1.2.3')
  assert.equal(url.searchParams.get('applied_version'), '11')
  assert.equal(request.method, 'GET')
  assert.equal(request.timeout, 10_000)
  assert.equal(isInternalRequest(request), true)
  controller.stop()
})

test('string and function proxies receive the configuration path and parameters', () => {
  const stringAdapter = createAdapter((options) => options.success?.({ statusCode: 304 }))
  const stringController = createRemoteConfigurationController(
    stringAdapter,
    configuration({ proxy: 'https://proxy.example.com/rum/' }),
    { setTimeout: () => 1 },
  )
  stringController.fetch(6)
  const proxyUrl = new URL(stringAdapter.requests[0].url)
  const forwarded = decodeURIComponent(proxyUrl.searchParams.get('ddforward')!)
  assert.ok(forwarded.startsWith('/api/v2/rum/config?'))
  assert.ok(forwarded.includes('sdk=miniprogram'))
  assert.ok(forwarded.includes('applied_version=6'))
  stringController.stop()

  const calls: Array<{ path: string; parameters: string }> = []
  const functionAdapter = createAdapter((options) =>
    options.success?.({
      statusCode: 200,
      data: { schema_version: 1, version: 7, enabled: true, rum: { sessionSampleRate: 30 } },
    }),
  )
  const functionController = createRemoteConfigurationController(
    functionAdapter,
    configuration({
      proxy: (options: { path: string; parameters: string }) => {
        calls.push(options)
        return `https://function-proxy.example.com${options.path}?${options.parameters}`
      },
    }),
  )
  functionController.fetch()
  assert.equal(calls.at(-1)?.path, '/api/v2/rum/config')
  assert.ok(calls.at(-1)?.parameters.includes('client_token=token%20value'))
  functionController.stop()
})

test('retryable failures use 5s and 60s jittered delays and stop after two retries', () => {
  const pendingRequests: RequestOptions[] = []
  const scheduled: Array<{ callback: () => void; delay: number }> = []
  const adapter = createAdapter((options) => pendingRequests.push(options))
  const controller = createRemoteConfigurationController(adapter, configuration(), {
    random: () => 0.5,
    setTimeout: (callback, delay) => {
      scheduled.push({ callback, delay })
      return scheduled.length
    },
  })

  controller.fetch()
  pendingRequests.shift()!.success?.({ statusCode: 500 })
  assert.equal(scheduled[0].delay, 5_000)
  controller.fetch(99)
  assert.equal(adapter.requests.length, 1, 'the retry wait remains part of the active chain')
  scheduled.shift()!.callback()
  pendingRequests.shift()!.success?.({ statusCode: 429 })
  assert.equal(scheduled[0].delay, 60_000)
  controller.fetch(99)
  assert.equal(adapter.requests.length, 2, 'the 60 second retry wait also remains deduplicated')
  scheduled.shift()!.callback()
  pendingRequests.shift()!.fail?.({ errMsg: 'timeout' })

  assert.equal(adapter.requests.length, 3)
  assert.equal(scheduled.length, 0)
  controller.stop()
})

test('stop prevents an already queued retry from sending another request', () => {
  const scheduled: Array<() => void> = []
  const adapter = createAdapter((options) => options.success?.({ statusCode: 500 }))
  const controller = createRemoteConfigurationController(adapter, configuration(), {
    setTimeout: (callback) => {
      scheduled.push(callback)
      return scheduled.length
    },
  })

  controller.fetch()
  assert.equal(adapter.requests.length, 1)
  assert.equal(scheduled.length, 1)

  controller.stop()
  scheduled[0]()
  assert.equal(adapter.requests.length, 1)
})

test('stop ignores a late response from the active request', () => {
  let request: RequestOptions | undefined
  const adapter = createAdapter((options) => {
    request = options
  })
  const controller = createRemoteConfigurationController(adapter, configuration())

  controller.fetch()
  controller.stop()
  request!.success?.({
    statusCode: 200,
    data: { schema_version: 1, version: 50, enabled: true, rum: { sessionSampleRate: 0 } },
  })

  assert.deepEqual(controller.getSessionConfiguration(), { sessionSampleRate: 73, rcVersion: 0, custom: null })
})

test('401, 403 and other 4xx do not retry while malformed callbacks schedule once', () => {
  for (const statusCode of [400, 401, 403, 404]) {
    const scheduled: number[] = []
    const adapter = createAdapter((options) => options.success?.({ statusCode }))
    const controller = createRemoteConfigurationController(adapter, configuration(), {
      setTimeout: (_callback, delay) => scheduled.push(delay),
    })
    controller.fetch()
    assert.equal(scheduled.length, 0, `status ${statusCode}`)
    controller.stop()
  }

  const scheduled: number[] = []
  const adapter = createAdapter((options) => {
    options.success?.({ statusCode: 200, data: '{bad' })
    options.fail?.({ errMsg: 'late failure' })
  })
  const controller = createRemoteConfigurationController(adapter, configuration(), {
    random: () => 0.5,
    setTimeout: (_callback, delay) => scheduled.push(delay),
  })
  assert.doesNotThrow(() => controller.fetch())
  assert.deepEqual(scheduled, [5_000])
  controller.stop()
})
