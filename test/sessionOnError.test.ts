import test from 'node:test'
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { isWithholdingEvents, startSessionManager } from '../packages/core/src/domain/session/sessionManager'
import type { SessionState } from '../packages/core/src/domain/session/sessionManager'
import { startRum } from '../packages/miniprogram-rum/src/boot/startRum'
import { validateAndBuildRumConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'
import type { RumInitConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'
import { LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import type { PlatformAdapter, RequestOptions } from '../packages/miniprogram-platform/src/platform/types'
import { computeReleaseDelay } from '../packages/miniprogram-rum/src/transport/withheldEventBuffer'

function createStore() {
  let stored: SessionState | undefined
  let writes = 0
  return {
    get: () => stored,
    set: (state: SessionState) => {
      writes += 1
      stored = JSON.parse(JSON.stringify(state))
    },
    clear: () => {
      stored = undefined
    },
    writes: () => writes,
  }
}

function withRandom(t: TestContext, value: number) {
  t.mock.method(Math, 'random', () => value)
}

// --- Draw -------------------------------------------------------------------------------------

test('a session the plain draw missed is kept on error only when the switch is on', (t) => {
  for (const scenario of [
    { rate: 0, sessionOnError: true, random: 0.5, tracked: true, onError: true },
    { rate: 0, sessionOnError: false, random: 0.5, tracked: false, onError: false },
    { rate: 40, sessionOnError: true, random: 0.9, tracked: true, onError: true },
    { rate: 40, sessionOnError: true, random: 0.1, tracked: true, onError: false },
    { rate: 100, sessionOnError: true, random: 0.99, tracked: true, onError: false },
  ]) {
    withRandom(t, scenario.random)
    const manager = startSessionManager(createStore(), {
      sessionSampleRate: scenario.rate,
      sessionOnError: scenario.sessionOnError,
    })
    const session = manager.renew()
    const name = JSON.stringify(scenario)
    assert.equal(session.isTracked, scenario.tracked, name)
    assert.equal(session.sampledOnError === true, scenario.onError, name)
    assert.equal(isWithholdingEvents(session), scenario.onError, name)
    assert.equal(manager.findTrackedSession()?.id === session.id, scenario.tracked, name)
    t.mock.restoreAll()
  }
})

test('the delivered switch takes precedence over the initialization value', () => {
  const on = startSessionManager(createStore(), {
    sessionSampleRate: 0,
    sessionOnError: false,
    getSessionConfiguration: () => ({ sessionSampleRate: 0, sessionOnError: true, rcVersion: 3, custom: null }),
  })
  assert.equal(on.renew().sampledOnError, true)

  const off = startSessionManager(createStore(), {
    sessionSampleRate: 0,
    sessionOnError: true,
    getSessionConfiguration: () => ({ sessionSampleRate: 0, sessionOnError: false, rcVersion: 3, custom: null }),
  })
  assert.equal(off.renew().isTracked, false)
})

test('beforeSampling drawing a visitor to 0 turns the switch off, a rate it leaves alone keeps it', (t) => {
  const zero = startSessionManager(createStore(), { sessionSampleRate: 50, sessionOnError: true, beforeSampling: () => 0 })
  const excluded = zero.renew()
  assert.equal(excluded.isTracked, false)
  assert.equal(excluded.sampledOnError, undefined)

  withRandom(t, 0.99)
  const untouched = startSessionManager(createStore(), {
    sessionSampleRate: 0,
    sessionOnError: true,
    beforeSampling: () => undefined,
  })
  assert.equal(untouched.renew().sampledOnError, true)

  const partial = startSessionManager(createStore(), { sessionSampleRate: 0, sessionOnError: true, beforeSampling: () => 20 })
  assert.equal(partial.renew().sampledOnError, true)
})

test('a forced draw is collected in full rather than on error', () => {
  const manager = startSessionManager(createStore(), { sessionSampleRate: 0, sessionOnError: true })
  manager.setForcedSession()
  const forced = manager.renew()
  assert.equal(forced.isTracked, true)
  assert.equal(forced.sampledOnError, undefined)
  assert.equal(manager.renew().sampledOnError, true)
})

// --- Release ----------------------------------------------------------------------------------

test('release marks a withholding session once, persists it, and keeps it after a restart', () => {
  const store = createStore()
  const manager = startSessionManager(store, { sessionSampleRate: 0, sessionOnError: true })
  const session = manager.renew()

  assert.equal(manager.release('another-session'), false)
  assert.equal(manager.release(session.id), true)
  assert.equal(manager.release(session.id), false, 'released only once')
  assert.equal(isWithholdingEvents(manager.findSession()!), false)
  assert.equal(manager.findSession()!.sampledOnError, true, 'still marked as kept on error')

  const restarted = startSessionManager(store, { sessionSampleRate: 0, sessionOnError: true })
  const restored = restarted.findSession()!
  assert.equal(restored.id, session.id)
  assert.equal(restored.sampledOnError, true)
  assert.equal(restored.isReleased, true)
})

test('release never writes the store of a session that withholds nothing', () => {
  const store = createStore()
  const manager = startSessionManager(store, { sessionSampleRate: 100, sessionOnError: true })
  const session = manager.renew()
  const writes = store.writes()
  assert.equal(manager.release(session.id), false)
  assert.equal(store.writes(), writes)
})

test('a release holds in memory even when persisting it fails', () => {
  const store = createStore()
  const manager = startSessionManager(store, { sessionSampleRate: 0, sessionOnError: true })
  const session = manager.renew()
  const persisted = store.get()!
  store.set = () => {
    throw new Error('storage quota exceeded')
  }
  store.get = () => ({ ...persisted })
  assert.equal(manager.release(session.id), true)
  assert.equal(isWithholdingEvents(manager.findSession()!), false)
})

test('a session restored from storage keeps its on-error draw', () => {
  const store = createStore()
  startSessionManager(store, { sessionSampleRate: 0, sessionOnError: true }).renew()
  // The next launch configures a plain rate: the restored session keeps the draw it was created with.
  const restored = startSessionManager(store, { sessionSampleRate: 100, sessionOnError: false }).findSession()!
  assert.equal(restored.sampledOnError, true)
  assert.equal(isWithholdingEvents(restored), true)
})

// --- startRum integration ---------------------------------------------------------------------

let originalWxDescriptor: PropertyDescriptor | undefined
let originalPageDescriptor: PropertyDescriptor | undefined
let originalGetCurrentPagesDescriptor: PropertyDescriptor | undefined
/** Stopped before the globals they patch are restored. */
const startedInstances: Array<ReturnType<typeof startRum>> = []

test.beforeEach(() => {
  originalWxDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'wx')
  originalPageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Page')
  originalGetCurrentPagesDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'getCurrentPages')
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/home' }]
  ;(globalThis as any).wx = {
    request: () => ({ abort: () => undefined }),
    getPerformance: () => undefined,
  }
  ;(globalThis as any).Page = (options: Record<string, any>) => options
})

test.afterEach(() => {
  startedInstances.splice(0).forEach((started) => started.stop())
  for (const [name, descriptor] of [
    ['wx', originalWxDescriptor],
    ['Page', originalPageDescriptor],
    ['getCurrentPages', originalGetCurrentPagesDescriptor],
  ] as const) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor)
    } else {
      delete (globalThis as any)[name]
    }
  }
})

interface Harness {
  started: ReturnType<typeof startRum>
  intakeEvents: () => any[]
  configRequests: RequestOptions[]
  hideApp: () => void
  collected: any[]
  storage: Map<string, unknown>
}

function startHarness(
  t: TestContext,
  init: Partial<RumInitConfiguration>,
  storage = new Map<string, unknown>(),
): Harness {
  const intakePayloads: string[] = []
  const configRequests: RequestOptions[] = []
  const hideCallbacks: Array<() => void> = []
  const adapter: PlatformAdapter = {
    request: (options: RequestOptions) => {
      if (options.url.includes('/api/v2/rum/config')) {
        configRequests.push(options)
      } else if (options.url.includes('ddsource')) {
        intakePayloads.push(options.data as string)
        options.success?.({ statusCode: 202, data: '' })
      }
      return { abort: () => undefined }
    },
    uploadFile: () => ({ abort: () => undefined }),
    downloadFile: () => ({ abort: () => undefined }),
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
    onAppHide: (callback: () => void) => {
      hideCallbacks.push(callback)
    },
    onError: () => undefined,
    onUnhandledRejection: () => undefined,
    onPageNotFound: () => undefined,
    onLazyLoadError: () => undefined,
  } as PlatformAdapter
  const configuration = validateAndBuildRumConfiguration({
    clientToken: 'token',
    applicationId: 'app',
    trackActions: false,
    trackPerformance: false,
    flushInterval: 100000,
    ...init,
  } as RumInitConfiguration)!
  const started = startRum(configuration, adapter)
  const collected: any[] = []
  started.lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => collected.push(event))
  startedInstances.push(started)
  return {
    started,
    collected,
    configRequests,
    storage,
    hideApp: () => hideCallbacks.forEach((callback) => callback()),
    intakeEvents: () =>
      intakePayloads.flatMap((payload) =>
        payload
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line)),
      ),
  }
}

function enableTimers(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 })
}

test('an on-error session uploads nothing until it errors, then its view and error with the markers', (t) => {
  enableTimers(t)
  const { started, intakeEvents, hideApp } = startHarness(t, { sessionSampleRate: 0, sessionOnError: true })
  started.startPage('pages/home')
  started.addCustomEvent('before-error')
  hideApp()
  assert.equal(intakeEvents().length, 0, 'nothing leaves before the error, not even on app hide')

  started.addError('boom', 'custom')
  t.mock.timers.tick(3_000)
  hideApp()
  const events = intakeEvents()
  assert.deepEqual(
    events.map((event) => event.type),
    ['view', 'error', 'custom'],
  )
  const view = events[0]
  assert.equal(view.session.sampled_for_error, true)
  assert.equal(view._dd.configuration.session_sample_rate, 0)
  assert.equal(events[1].session.id, view.session.id)
})

test('a plainly sampled session carries neither marker nor a zero rate', (t) => {
  enableTimers(t)
  const { started, intakeEvents, hideApp } = startHarness(t, { sessionSampleRate: 100, sessionOnError: true })
  started.startPage('pages/home')
  started.addError('boom', 'custom')
  hideApp()
  const view = intakeEvents().find((event) => event.type === 'view')
  assert.equal(view.session.sampled_for_error, undefined)
  assert.equal(view._dd.configuration.session_sample_rate, 100)
})

test('app hide sends a release still waiting on its jitter', (t) => {
  enableTimers(t)
  const { started, intakeEvents, hideApp } = startHarness(t, { sessionSampleRate: 0, sessionOnError: true })
  started.startPage('pages/home')
  started.addError('boom', 'custom')
  hideApp()
  assert.deepEqual(
    intakeEvents().map((event) => event.type),
    ['view', 'error'],
  )
})

test('an error dropped by beforeSend releases nothing', (t) => {
  enableTimers(t)
  const dropErrors = (event: any) => event.type !== 'error'
  const dropped = startHarness(t, { sessionSampleRate: 0, sessionOnError: true, beforeSend: dropErrors })
  dropped.started.startPage('pages/home')
  dropped.started.addError('boom', 'custom')
  t.mock.timers.tick(3_000)
  dropped.hideApp()
  assert.equal(dropped.intakeEvents().length, 0)

  // Control: the same error kept by beforeSend releases the session.
  const kept = startHarness(t, { sessionSampleRate: 0, sessionOnError: true, beforeSend: () => true })
  kept.started.startPage('pages/home')
  kept.started.addError('boom', 'custom')
  kept.hideApp()
  assert.deepEqual(
    kept.intakeEvents().map((event) => event.type),
    ['view', 'error'],
  )
})

test('the rate limiter report is the SDK own error and releases nothing', (t) => {
  enableTimers(t)
  const { started, intakeEvents, hideApp, collected } = startHarness(t, {
    sessionSampleRate: 0,
    sessionOnError: true,
    eventRateLimiterThreshold: 1,
  })
  started.startPage('pages/home')
  started.addCustomEvent('first')
  started.addCustomEvent('second-is-rate-limited')
  assert.ok(collected.some((event) => event.type === 'error' && event.error.source === 'agent'))
  t.mock.timers.tick(3_000)
  hideApp()
  assert.equal(intakeEvents().length, 0)
})

test('beforeSampling drawing the visitor to 0 keeps an erroring session off the intake', (t) => {
  enableTimers(t)
  const excluded = startHarness(t, { sessionSampleRate: 50, sessionOnError: true, beforeSampling: () => 0 })
  excluded.started.startPage('pages/home')
  excluded.started.addError('boom', 'custom')
  excluded.hideApp()
  assert.equal(excluded.intakeEvents().length, 0)

  // Control: beforeSampling leaving the rate alone keeps the switch.
  withRandom(t, 0.99)
  const untouched = startHarness(t, { sessionSampleRate: 50, sessionOnError: true, beforeSampling: () => undefined })
  untouched.started.startPage('pages/home')
  untouched.started.addError('boom', 'custom')
  untouched.hideApp()
  assert.ok(untouched.intakeEvents().some((event) => event.type === 'error'))
})

test('setForcedSession releases a withholding session at once and still forces the next one', (t) => {
  enableTimers(t)
  const { started, intakeEvents, hideApp } = startHarness(t, { sessionSampleRate: 0, sessionOnError: true })
  started.startPage('pages/home')
  started.addCustomEvent('held')
  const session = started.sessionManager.findSession()!
  started.setForcedSession()
  hideApp()
  // Released without jitter; the hide then adds the view update it always sends.
  assert.deepEqual(
    intakeEvents().map((event) => event.type),
    ['view', 'custom', 'view'],
  )
  assert.equal(started.sessionManager.findSession()!.id, session.id, 'the current draw stands')
  started.sessionManager.expire()
  started.addCustomEvent('next')
  const next = started.sessionManager.findSession()!
  assert.equal(next.isForced, true)
  assert.equal(next.sampledOnError, undefined)
})

test('a renewed session discards what an error-free on-error session held', (t) => {
  enableTimers(t)
  const { started, intakeEvents, hideApp } = startHarness(t, { sessionSampleRate: 0, sessionOnError: true })
  started.startPage('pages/home')
  started.addCustomEvent('held')
  const first = started.sessionManager.findSession()!
  started.sessionManager.expire()
  started.addCustomEvent('new-session')
  assert.notEqual(started.sessionManager.findSession()!.id, first.id)
  started.addError('boom', 'custom')
  t.mock.timers.tick(3_000)
  hideApp()
  const ids = new Set(intakeEvents().map((event) => event.session.id))
  assert.equal(ids.has(first.id), false, 'the discarded session never reaches the intake')
})

test('a cold start restoring an on-error session still reports a zero rate', (t) => {
  enableTimers(t)
  const storage = new Map<string, unknown>()
  const first = startHarness(t, { sessionSampleRate: 0, sessionOnError: true }, storage)
  const sessionId = first.started.sessionManager.findSession()!.id

  const second = startHarness(t, { sessionSampleRate: 20, sessionOnError: false }, storage)
  assert.equal(second.started.sessionManager.findSession()!.id, sessionId)
  second.started.startPage('pages/home')
  second.started.addError('boom', 'custom')
  second.hideApp()
  const view = second.intakeEvents().find((event) => event.type === 'view')
  assert.equal(view.session.id, sessionId)
  assert.equal(view._dd.configuration.session_sample_rate, 0)
  assert.equal(view.session.sampled_for_error, true)
})

// --- Remote configuration ---------------------------------------------------------------------

async function deliver(harness: Harness, rum: Record<string, unknown>, version: number) {
  await Promise.resolve()
  const request = harness.configRequests[harness.configRequests.length - 1]
  request.success?.({ statusCode: 200, data: { schema_version: 1, version, enabled: true, rum } })
}

test('a zero rate next to the switch does not end an on-error session', async (t) => {
  withRandom(t, 0.99)
  const harness = startHarness(t, { sessionSampleRate: 50, sessionOnError: true, remoteConfigurationEnabled: true })
  const session = harness.started.sessionManager.findSession()!
  assert.equal(session.sampledOnError, true)
  await deliver(harness, { sessionSampleRate: 0, sessionOnError: true }, 2)
  assert.equal(harness.started.sessionManager.findSession()?.id, session.id)
})

test('the console turning the switch off at a zero rate ends an on-error session', async (t) => {
  const harness = startHarness(t, { sessionSampleRate: 0, sessionOnError: true, remoteConfigurationEnabled: true })
  assert.equal(harness.started.sessionManager.findSession()!.sampledOnError, true)
  await deliver(harness, { sessionSampleRate: 0, sessionOnError: false }, 2)
  assert.equal(harness.started.sessionManager.findSession(), undefined)
})

test('a zero rate still ends a plainly drawn session even with the switch on', async (t) => {
  const harness = startHarness(t, { sessionSampleRate: 100, remoteConfigurationEnabled: true })
  await deliver(harness, { sessionSampleRate: 0, sessionOnError: true }, 2)
  assert.equal(harness.started.sessionManager.findSession(), undefined)
  harness.started.addCustomEvent('next')
  assert.equal(harness.started.sessionManager.findSession()!.sampledOnError, true)
})

test('a session drawn at zero is drawn again when the switch turns on', async (t) => {
  const harness = startHarness(t, { sessionSampleRate: 0, remoteConfigurationEnabled: true })
  assert.equal(harness.started.sessionManager.findSession()!.isTracked, false)
  await deliver(harness, { sessionSampleRate: 0, sessionOnError: true }, 2)
  assert.equal(harness.started.sessionManager.findSession(), undefined)
  harness.started.addCustomEvent('next')
  assert.equal(harness.started.sessionManager.findSession()!.sampledOnError, true)
})

test('a session that lost a draw at a real rate is not drawn again when the switch turns on', async (t) => {
  withRandom(t, 0.99)
  const harness = startHarness(t, { sessionSampleRate: 20, remoteConfigurationEnabled: true })
  const session = harness.started.sessionManager.findSession()!
  assert.equal(session.isTracked, false)
  await deliver(harness, { sessionSampleRate: 20, sessionOnError: true }, 2)
  assert.equal(harness.started.sessionManager.findSession()?.id, session.id)
})

test('the switch turning on mid-session does not change a plainly sampled session', async (t) => {
  const harness = startHarness(t, { sessionSampleRate: 100, remoteConfigurationEnabled: true })
  const session = harness.started.sessionManager.findSession()!
  await deliver(harness, { sessionSampleRate: 100, sessionOnError: true }, 2)
  assert.equal(harness.started.sessionManager.findSession()?.id, session.id)
  assert.equal(harness.started.sessionManager.findSession()?.sampledOnError, undefined)
})

test('an on-error session keeps its draw when the rate rises', async (t) => {
  const harness = startHarness(t, { sessionSampleRate: 0, sessionOnError: true, remoteConfigurationEnabled: true })
  const session = harness.started.sessionManager.findSession()!
  await deliver(harness, { sessionSampleRate: 30, sessionOnError: true }, 2)
  assert.equal(harness.started.sessionManager.findSession()?.id, session.id)
  assert.equal(harness.started.sessionManager.findSession()?.sampledOnError, true)
})

test('a renewed on-error session keeps the view it opens with', (t) => {
  enableTimers(t)
  const { started, intakeEvents, hideApp } = startHarness(t, { sessionSampleRate: 0, sessionOnError: true })
  started.startPage('pages/home')
  t.mock.timers.tick(1_000)
  started.sessionManager.expire()
  t.mock.timers.tick(1_000)
  // Renewal re-opens the current page for the new session before this event is assembled.
  started.addCustomEvent('renews')
  const renewed = started.sessionManager.findSession()!
  started.addError('boom', 'custom')
  t.mock.timers.tick(3_000)
  hideApp()
  const events = intakeEvents()
  assert.ok(events.every((event) => event.session.id === renewed.id), 'the first session never errored')
  // Released with the view it opened with; only later view updates follow.
  const types = events.map((event) => event.type)
  assert.deepEqual(types.slice(0, 3), ['view', 'error', 'custom'])
  assert.ok(types.slice(3).every((type) => type === 'view'))
})

test('an on-error session with page tracking off releases its error and history', (t) => {
  enableTimers(t)
  const { started, intakeEvents, hideApp } = startHarness(t, {
    sessionSampleRate: 0,
    sessionOnError: true,
    trackPages: false,
  })
  started.addCustomEvent('before-error')
  started.addError('boom', 'custom')
  t.mock.timers.tick(3_000)
  hideApp()
  assert.deepEqual(
    intakeEvents().map((event) => event.type),
    ['error', 'custom'],
  )
})

test('an error raised before the first page is released with the session', (t) => {
  enableTimers(t)
  const { started, intakeEvents, hideApp } = startHarness(t, { sessionSampleRate: 0, sessionOnError: true })
  started.addCustomEvent('during-launch')
  started.addError('launch failed', 'custom')
  started.startPage('pages/home')
  t.mock.timers.tick(3_000)
  hideApp()
  const events = intakeEvents()
  assert.deepEqual(
    events.slice(0, 3).map((event) => `${event.type}:${event.view.id === 'unknown' ? 'unknown' : 'page'}`),
    ['view:page', 'error:unknown', 'custom:unknown'],
  )
})

test('setForcedSession sends a release still waiting on its jitter at once', (t) => {
  enableTimers(t)
  withRandom(t, 0.5)
  const { started, intakeEvents } = startHarness(t, { sessionSampleRate: 0, sessionOnError: true, flushInterval: 1 })
  started.startPage('pages/home')
  started.addError('boom', 'custom')
  const session = started.sessionManager.findSession()!
  assert.ok(computeReleaseDelay(session.id) > 1, 'the release is still waiting on its jitter')
  started.setForcedSession()
  t.mock.timers.tick(1)
  assert.deepEqual(
    intakeEvents().map((event) => event.type),
    ['view', 'error'],
  )
})
