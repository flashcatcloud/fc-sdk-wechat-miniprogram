import test from 'node:test'
import assert from 'node:assert/strict'
import { Observable, startSessionManager } from '../packages/core/src'
import type { ContextManager, SessionState } from '../packages/core/src'
import { LifeCycle, LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import { startPageCollection } from '../packages/miniprogram-rum/src/domain/page/pageCollection'
import { startRumAssembly } from '../packages/miniprogram-rum/src/domain/assembly'
import type { AppEvent, PageEvent, PlatformAdapter } from '../packages/miniprogram-platform/src'
import type { RumConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'
import type { RumEvent } from '../packages/miniprogram-rum/src/rumEvent.types'

const PAGE_UPDATE_INTERVAL = 3000
const SESSION_EXPIRATION_DELAY = 15 * 60 * 1000

function createStore() {
  let stored: SessionState | undefined
  return {
    get: () => stored,
    set: (state: SessionState) => {
      stored = state
    },
    clear: () => {
      stored = undefined
    },
  }
}

function createContextManager(): ContextManager {
  return {
    getContext: () => ({}),
    setContext: () => undefined,
    addContext: () => undefined,
    removeContext: () => undefined,
    clearContext: () => undefined,
  }
}

const configuration = {
  applicationId: 'app',
  sessionSampleRate: 100,
  eventRateLimiterThreshold: 1000,
} as RumConfiguration

const adapter = {
  getNetworkType: ({ success }: { success: (res: { networkType: string }) => void }) => success({ networkType: 'wifi' }),
  onNetworkStatusChange: () => undefined,
} as unknown as PlatformAdapter

function setup(t: test.TestContext) {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const originalNow = Date.now
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  let clock = 1_000
  let stepping = false
  // While stepping, every read advances the clock, so work done inside one call
  // spans several milliseconds as it does on a real device.
  Date.now = () => (stepping ? clock++ : clock)
  ;(globalThis as any).getCurrentPages = () => []

  const lifeCycle = new LifeCycle()
  const pageObservable = new Observable<PageEvent>()
  const appObservable = new Observable<AppEvent>()
  const sessionManager = startSessionManager(createStore())
  sessionManager.renew()
  const pageCollection = startPageCollection(lifeCycle, pageObservable, configuration, appObservable)
  const assembly = startRumAssembly({
    lifeCycle,
    configuration,
    sessionManager,
    globalContext: createContextManager(),
    userContext: createContextManager(),
    getCurrentPage: pageCollection.getCurrentPage,
    findPage: pageCollection.findPage,
    adapter,
  })
  const collected: RumEvent[] = []
  let renewals = 0
  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => collected.push(event))
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    renewals += 1
  })

  t.after(() => {
    assembly.stop()
    pageCollection.stop()
    Date.now = originalNow
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  })

  return {
    lifeCycle,
    pageObservable,
    appObservable,
    sessionManager,
    pageCollection,
    collected,
    renewals: () => renewals,
    setClock: (value: number) => {
      clock = value
    },
    now: () => clock,
    stepClock: (run: () => void) => {
      stepping = true
      try {
        run()
      } finally {
        stepping = false
      }
    },
    advance(ms: number) {
      clock += ms
      t.mock.timers.tick(ms)
    },
  }
}

function sessionIds(events: RumEvent[]) {
  return new Set(events.map((event) => event.session.id))
}

test('a page started right after the session is stopped does not renew the session on every update', (t) => {
  const env = setup(t)
  env.pageCollection.startManualPage('pages/first/index')
  env.advance(1_000)
  env.sessionManager.expire()

  env.stepClock(() => env.pageCollection.startManualPage('pages/second/index'))
  const renewalsAfterStart = env.renewals()
  const currentSessionId = env.sessionManager.findSession()?.id
  env.collected.length = 0

  for (let i = 0; i < 3; i += 1) {
    env.advance(PAGE_UPDATE_INTERVAL)
  }

  assert.equal(env.renewals(), renewalsAfterStart)
  assert.ok(env.collected.length > 0)
  assert.deepEqual([...sessionIds(env.collected)], [currentSessionId])
})

test('a page loaded right after the session is stopped does not renew the session on every update', (t) => {
  const env = setup(t)
  env.pageObservable.notify({ route: 'pages/first/index', lifecycle: 'load', time: env.now() })
  env.advance(1_000)
  env.sessionManager.expire()

  env.stepClock(() => env.pageObservable.notify({ route: 'pages/second/index', lifecycle: 'load', time: env.now() }))
  const renewalsAfterLoad = env.renewals()
  const currentSessionId = env.sessionManager.findSession()?.id
  env.collected.length = 0

  for (let i = 0; i < 3; i += 1) {
    env.advance(PAGE_UPDATE_INTERVAL)
  }

  assert.equal(env.renewals(), renewalsAfterLoad)
  assert.ok(env.collected.length > 0)
  assert.deepEqual([...sessionIds(env.collected)], [currentSessionId])
})

test('a page shown without a loaded page right after the session is stopped does not renew the session on every update', (t) => {
  const env = setup(t)
  env.pageObservable.notify({ route: 'pages/first/index', lifecycle: 'load', time: env.now() })
  env.pageObservable.notify({ route: 'pages/first/index', lifecycle: 'unload', time: env.now() })
  env.advance(1_000)
  env.sessionManager.expire()

  env.stepClock(() => env.pageObservable.notify({ route: 'pages/second/index', lifecycle: 'show', time: env.now() }))
  const renewalsAfterShow = env.renewals()
  const currentSessionId = env.sessionManager.findSession()?.id
  env.collected.length = 0

  for (let i = 0; i < 3; i += 1) {
    env.advance(PAGE_UPDATE_INTERVAL)
  }

  assert.equal(env.renewals(), renewalsAfterShow)
  assert.ok(env.collected.length > 0)
  assert.deepEqual([...sessionIds(env.collected)], [currentSessionId])
})

test('returning to the foreground after the session expired stops updating the previous view', (t) => {
  const env = setup(t)
  env.pageObservable.notify({ route: 'pages/home/index', lifecycle: 'load', time: env.now() })
  const previousViewId = env.pageCollection.getCurrentPage()?.id
  env.advance(1_000)
  env.appObservable.notify({ lifecycle: 'hide', time: env.now() })

  env.setClock(env.now() + SESSION_EXPIRATION_DELAY + 1_000)
  env.stepClock(() => env.appObservable.notify({ lifecycle: 'show', time: env.now() }))
  const currentSessionId = env.sessionManager.findSession()?.id
  env.collected.length = 0

  for (let i = 0; i < 3; i += 1) {
    env.advance(PAGE_UPDATE_INTERVAL)
  }

  assert.ok(env.collected.length > 0)
  assert.equal(
    env.collected.some((event) => event.view.id === previousViewId),
    false,
  )
  assert.deepEqual([...sessionIds(env.collected)], [currentSessionId])
})
