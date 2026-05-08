import test from 'node:test'
import assert from 'node:assert/strict'
import { Observable, startSessionManager } from '../packages/core/src'
import type { ContextManager, SessionState } from '../packages/core/src'
import { LifeCycle, LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import { startPageCollection } from '../packages/miniprogram-rum/src/domain/page/pageCollection'
import { startRumAssembly } from '../packages/miniprogram-rum/src/domain/assembly'
import type { PageEvent, PlatformAdapter } from '../packages/miniprogram-platform/src'
import type { RawRumResourceEvent } from '../packages/miniprogram-rum/src/rawRumEvent.types'
import type { RumConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'
import type { RumEvent } from '../packages/miniprogram-rum/src/rumEvent.types'

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
  eventRateLimiterThreshold: 100,
} as RumConfiguration

const adapter = {
  getNetworkType: ({ success }: { success: (res: { networkType: string }) => void }) => success({ networkType: 'wifi' }),
  onNetworkStatusChange: () => undefined,
} as unknown as PlatformAdapter

function setup() {
  const lifeCycle = new LifeCycle()
  const pageObservable = new Observable<PageEvent>()
  const sessionManager = startSessionManager(createStore())
  const pageCollection = startPageCollection(lifeCycle, pageObservable, configuration)
  const collected: RumEvent[] = []
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
  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => collected.push(event))

  return {
    lifeCycle,
    pageObservable,
    sessionManager,
    pageCollection,
    collected,
    stop: () => {
      assembly.stop()
      pageCollection.stop()
    },
  }
}

test('assembly assigns async resource to the page active at resource start time', () => {
  const originalNow = Date.now
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  Date.now = () => 1_000
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/b/index' }, { route: 'pages/a/index' }]
  const setupResult = setup()
  try {
    setupResult.sessionManager.renew()
    setupResult.pageObservable.notify({ route: 'pages/a/index', lifecycle: 'load', time: 1_000 })
    const pageAId = setupResult.pageCollection.getCurrentPage()!.id
    setupResult.pageObservable.notify({ route: 'pages/b/index', lifecycle: 'load', time: 2_000 })
    Date.now = () => 3_000
    const pageBId = setupResult.pageCollection.getCurrentPage()!.id
    assert.notEqual(pageAId, pageBId)
    setupResult.collected.length = 0

    setupResult.lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: 1_500,
      type: 'resource',
      resource: {
        id: 'resource-id',
        type: 'xhr',
        url: 'https://api.example.com/data',
        method: 'GET',
        duration: 10,
      },
    } as RawRumResourceEvent)

    const resourceEvent = setupResult.collected.find((event) => event.type === 'resource')
    assert.ok(resourceEvent)
    assert.equal(resourceEvent.view.id, pageAId)
    assert.equal(resourceEvent.view.name, 'pages/a/index')
  } finally {
    setupResult.stop()
    Date.now = originalNow
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})

test('page collection emits old page view update when an async resource is counted after navigation', () => {
  const originalNow = Date.now
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  Date.now = () => 1_000
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/b/index' }, { route: 'pages/a/index' }]
  const setupResult = setup()
  try {
    setupResult.sessionManager.renew()
    setupResult.pageObservable.notify({ route: 'pages/a/index', lifecycle: 'load', time: 1_000 })
    const pageAId = setupResult.pageCollection.getCurrentPage()!.id
    setupResult.pageObservable.notify({ route: 'pages/b/index', lifecycle: 'load', time: 2_000 })
    setupResult.collected.length = 0

    setupResult.lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: 1_500,
      type: 'resource',
      resource: {
        id: 'resource-id',
        type: 'xhr',
        url: 'https://api.example.com/data',
        method: 'GET',
        duration: 10,
      },
    } as RawRumResourceEvent)

    const pageAViewUpdate = setupResult.collected.find(
      (event) => event.type === 'view' && event.view.id === pageAId && event.view.resource?.count === 1,
    )
    assert.ok(pageAViewUpdate)
  } finally {
    setupResult.stop()
    Date.now = originalNow
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})

test('page collection preserves old page counts when async resources arrive after navigation', () => {
  const originalNow = Date.now
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  Date.now = () => 1_000
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/b/index' }, { route: 'pages/a/index' }]
  const setupResult = setup()
  try {
    setupResult.sessionManager.renew()
    setupResult.pageObservable.notify({ route: 'pages/a/index', lifecycle: 'load', time: 1_000 })
    const pageAId = setupResult.pageCollection.getCurrentPage()!.id

    setupResult.lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: 1_100,
      type: 'resource',
      resource: {
        id: 'resource-before-navigation',
        type: 'xhr',
        url: 'https://api.example.com/before',
        method: 'GET',
        duration: 10,
      },
    } as RawRumResourceEvent)

    setupResult.pageObservable.notify({ route: 'pages/b/index', lifecycle: 'load', time: 2_000 })
    setupResult.collected.length = 0

    setupResult.lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: 1_500,
      type: 'resource',
      resource: {
        id: 'resource-after-navigation',
        type: 'xhr',
        url: 'https://api.example.com/after',
        method: 'GET',
        duration: 10,
      },
    } as RawRumResourceEvent)

    const pageAViewUpdate = setupResult.collected.find(
      (event) => event.type === 'view' && event.view.id === pageAId && event.view.resource?.count === 2,
    )
    assert.ok(pageAViewUpdate)
  } finally {
    setupResult.stop()
    Date.now = originalNow
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})

test('assembly uses the session active at event time after current session expires', () => {
  const originalNow = Date.now
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  Date.now = () => 1_000
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/a/index' }]
  const setupResult = setup()

  try {
    const initialSession = setupResult.sessionManager.renew()
    setupResult.pageObservable.notify({ route: 'pages/a/index', lifecycle: 'load', time: 1_000 })
    setupResult.collected.length = 0

    Date.now = () => 1_000 + 15 * 60 * 1000 + 1
    setupResult.lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: 2_000,
      type: 'resource',
      resource: {
        id: 'resource-id',
        type: 'xhr',
        url: 'https://api.example.com/data',
        method: 'GET',
        duration: 10,
      },
    } as RawRumResourceEvent)

    assert.equal(setupResult.collected.length, 1)
    assert.equal(setupResult.collected[0].session.id, initialSession.id)
  } finally {
    setupResult.stop()
    Date.now = originalNow
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})

test('old page view update from async counts keeps the page session after session renewal', () => {
  const originalNow = Date.now
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  Date.now = () => 1_000
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/a/index' }]
  const setupResult = setup()

  try {
    const initialSession = setupResult.sessionManager.renew()
    setupResult.pageObservable.notify({ route: 'pages/a/index', lifecycle: 'load', time: 1_000 })
    const pageAId = setupResult.pageCollection.getCurrentPage()!.id

    Date.now = () => 5 * 60 * 60 * 1000
    const renewedSession = setupResult.sessionManager.renew()
    setupResult.lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED, { session: renewedSession })
    setupResult.collected.length = 0

    setupResult.lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: 1_500,
      type: 'resource',
      resource: {
        id: 'resource-after-session-renewal',
        type: 'xhr',
        url: 'https://api.example.com/after-renewal',
        method: 'GET',
        duration: 10,
      },
    } as RawRumResourceEvent)

    const pageAViewUpdate = setupResult.collected.find(
      (event) => event.type === 'view' && event.view.id === pageAId,
    )
    assert.ok(pageAViewUpdate)
    assert.equal(pageAViewUpdate.session.id, initialSession.id)
  } finally {
    setupResult.stop()
    Date.now = originalNow
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})

test('session renewal finalizes outgoing page with old session and switch time spent', () => {
  const originalNow = Date.now
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  Date.now = () => 1_000
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/a/index' }]
  const setupResult = setup()

  try {
    const initialSession = setupResult.sessionManager.renew()
    setupResult.pageObservable.notify({ route: 'pages/a/index', lifecycle: 'load', time: 1_000 })
    const pageId = setupResult.pageCollection.getCurrentPage()!.id
    setupResult.collected.length = 0

    Date.now = () => 2_500
    const renewedSession = setupResult.sessionManager.renew()
    setupResult.lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED, { session: renewedSession })

    const outgoingView = setupResult.collected.find(
      (event) => event.type === 'view' && event.view.id === pageId,
    )
    assert.ok(outgoingView)
    assert.equal(outgoingView.session.id, initialSession.id)
    assert.equal(outgoingView.view.time_spent, 1_500 * 1e6)
    assert.equal(outgoingView.view.is_active, false)
  } finally {
    setupResult.stop()
    Date.now = originalNow
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})
