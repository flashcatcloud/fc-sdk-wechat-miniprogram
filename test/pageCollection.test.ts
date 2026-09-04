import test from 'node:test'
import assert from 'node:assert/strict'
import { Observable } from '../packages/core/src'
import { LifeCycle, LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import { startPageCollection } from '../packages/miniprogram-rum/src/domain/page/pageCollection'
import type { AppEvent, PageEvent } from '../packages/miniprogram-platform/src'
import type { RumConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'
import type { RawRumEvent, RawRumViewEvent } from '../packages/miniprogram-rum/src/rawRumEvent.types'

const configuration = {
  sessionSampleRate: 100,
} as RumConfiguration

function setupPageCollection() {
  const lifeCycle = new LifeCycle()
  const pageObservable = new Observable<PageEvent>()
  const collected: RawRumEvent[] = []
  const pageCollection = startPageCollection(lifeCycle, pageObservable, configuration)
  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => collected.push(event))

  return {
    collected,
    pageCollection,
    pageObservable,
  }
}

test('manual page tracking reports initial_load after page stack collapse', () => {
  const originalNow = Date.now
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  Date.now = () => 1_000
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/home/index' }]

  const { collected, pageCollection, pageObservable } = setupPageCollection()

  try {
    pageObservable.notify({ route: 'pages/home/index', lifecycle: 'load', time: 1_000 })
    collected.length = 0

    Date.now = () => 2_000
    ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/manual/index' }]
    pageCollection.startManualPage('pages/manual/index')

    const manualPageView = collected.find(
      (event): event is RawRumViewEvent => event.type === 'view' && event.view.name === 'pages/manual/index',
    )
    assert.equal(manualPageView?.view.loading_type, 'initial_load')
  } finally {
    pageCollection.stop()
    Date.now = originalNow
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})

test('manual page tracking finalizes outgoing page time_spent at switch time', () => {
  const originalNow = Date.now
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  Date.now = () => 1_000
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/home/index' }]

  const { collected, pageCollection, pageObservable } = setupPageCollection()

  try {
    pageObservable.notify({ route: 'pages/home/index', lifecycle: 'load', time: 1_000 })
    const pageId = pageCollection.getCurrentPage()!.id
    collected.length = 0

    Date.now = () => 2_500
    pageCollection.startManualPage('pages/manual/index')

    const outgoingView = collected.find(
      (event): event is RawRumViewEvent => event.type === 'view' && event.view.id === pageId,
    )
    assert.equal(outgoingView?.view.time_spent, 1_500 * 1e6)
    assert.equal(outgoingView?.view.is_active, false)
  } finally {
    pageCollection.stop()
    Date.now = originalNow
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})

test('show without current page reports initial_load after page stack collapse', () => {
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/home/index' }]

  const { collected, pageCollection, pageObservable } = setupPageCollection()

  try {
    pageObservable.notify({ route: 'pages/home/index', lifecycle: 'load', time: 1_000 })
    pageObservable.notify({ route: 'pages/home/index', lifecycle: 'unload', time: 1_500 })
    collected.length = 0
    ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/relaunch/index' }]
    pageObservable.notify({ route: 'pages/relaunch/index', lifecycle: 'show', time: 2_000 })

    assert.equal((collected[0] as RawRumViewEvent).view.loading_type, 'initial_load')
  } finally {
    pageCollection.stop()
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})

test('app hide and show records page states and excludes background time from time_spent', () => {
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/home/index' }]
  const lifeCycle = new LifeCycle()
  const pageObservable = new Observable<PageEvent>()
  const appObservable = new Observable<AppEvent>()
  const collected: RawRumEvent[] = []
  const pageCollection = startPageCollection(lifeCycle, pageObservable, configuration, appObservable)
  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => collected.push(event))

  try {
    pageObservable.notify({ route: 'pages/home/index', lifecycle: 'load', time: 1_000 })
    collected.length = 0

    appObservable.notify({ lifecycle: 'hide', time: 2_000 })
    appObservable.notify({ lifecycle: 'show', time: 5_000 })

    const latestView = collected[collected.length - 1] as RawRumViewEvent
    assert.equal(latestView.view.time_spent, 1_000 * 1e6)
    assert.deepEqual(latestView._dd.page_states, [
      { state: 'hidden', start: 1_000 * 1e6 },
      { state: 'active', start: 4_000 * 1e6 },
    ])
  } finally {
    pageCollection.stop()
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})

test('page hide followed by app hide emits only one hidden view update', () => {
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/home/index' }]
  const lifeCycle = new LifeCycle()
  const pageObservable = new Observable<PageEvent>()
  const appObservable = new Observable<AppEvent>()
  const collected: RawRumEvent[] = []
  const pageCollection = startPageCollection(lifeCycle, pageObservable, configuration, appObservable)
  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => collected.push(event))

  try {
    pageObservable.notify({ route: 'pages/home/index', lifecycle: 'load', time: 1_000 })
    collected.length = 0

    pageObservable.notify({ route: 'pages/home/index', lifecycle: 'hide', time: 2_000 })
    appObservable.notify({ lifecycle: 'hide', time: 2_000 })

    const viewUpdates = collected.filter((event): event is RawRumViewEvent => event.type === 'view')
    assert.equal(viewUpdates.length, 1)
    assert.equal(viewUpdates[0]._dd.document_version, 1)
    assert.deepEqual(viewUpdates[0]._dd.page_states, [{ state: 'hidden', start: 1_000 * 1e6 }])
  } finally {
    pageCollection.stop()
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})

test('duplicate app show does not schedule duplicate view updates', () => {
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  let nextIntervalId = 1
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/home/index' }]
  ;(globalThis as any).setInterval = (() => nextIntervalId++) as unknown as typeof setInterval
  ;(globalThis as any).clearInterval = (() => undefined) as unknown as typeof clearInterval
  const lifeCycle = new LifeCycle()
  const pageObservable = new Observable<PageEvent>()
  const appObservable = new Observable<AppEvent>()
  const collected: RawRumEvent[] = []
  const pageCollection = startPageCollection(lifeCycle, pageObservable, configuration, appObservable)
  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => collected.push(event))

  try {
    pageObservable.notify({ route: 'pages/home/index', lifecycle: 'load', time: 1_000 })
    pageObservable.notify({ route: 'pages/home/index', lifecycle: 'hide', time: 2_000 })
    collected.length = 0

    appObservable.notify({ lifecycle: 'show', time: 5_000 })
    appObservable.notify({ lifecycle: 'show', time: 5_000 })

    const viewUpdates = collected.filter((event): event is RawRumViewEvent => event.type === 'view')
    assert.equal(viewUpdates.length, 1)
    assert.equal(nextIntervalId, 3)
  } finally {
    pageCollection.stop()
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})

test('a sampled-out renewed session finalizes the old view without starting a new view timer', () => {
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  let intervalCalls = 0
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/home/index' }]
  ;(globalThis as any).setInterval = (() => {
    intervalCalls += 1
    return intervalCalls
  }) as unknown as typeof setInterval
  ;(globalThis as any).clearInterval = (() => undefined) as unknown as typeof clearInterval

  const lifeCycle = new LifeCycle()
  const pageObservable = new Observable<PageEvent>()
  const collected: RawRumEvent[] = []
  const pageCollection = startPageCollection(lifeCycle, pageObservable, configuration, undefined, () => true)
  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => collected.push(event))

  try {
    pageObservable.notify({ route: 'pages/home/index', lifecycle: 'load', time: 1_000 })
    const oldPageId = pageCollection.getCurrentPage()!.id
    collected.length = 0

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED, {
      session: {
        id: 'sampled-out-session',
        created: 2_000,
        expireAt: 902_000,
        isTracked: false,
        sessionSampleRate: 0,
        rcVersion: 2,
      },
    })

    const renewedPage = pageCollection.getCurrentPage()!
    assert.notEqual(renewedPage.id, oldPageId)
    assert.equal(renewedPage.isTracked, false)
    assert.equal(renewedPage.updateIntervalId, undefined)
    assert.equal(intervalCalls, 1, 'only the original tracked page schedules an interval')
    assert.equal(collected.length, 1, 'only the outgoing tracked view is finalized')
    assert.equal((collected[0] as RawRumViewEvent).view.id, oldPageId)
  } finally {
    pageCollection.stop()
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})

test('page lifecycle stays idle while the current session is sampled out', () => {
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  const originalSetInterval = globalThis.setInterval
  let intervalCalls = 0
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/home/index' }]
  ;(globalThis as any).setInterval = (() => {
    intervalCalls += 1
    return intervalCalls
  }) as unknown as typeof setInterval

  const lifeCycle = new LifeCycle()
  const pageObservable = new Observable<PageEvent>()
  const collected: RawRumEvent[] = []
  const pageCollection = startPageCollection(lifeCycle, pageObservable, configuration, undefined, () => false)
  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => collected.push(event))

  try {
    pageObservable.notify({ route: 'pages/home/index', lifecycle: 'load', time: 1_000 })
    pageObservable.notify({ route: 'pages/home/index', lifecycle: 'ready', time: 1_100 })
    pageObservable.notify({ route: 'pages/home/index', lifecycle: 'hide', time: 2_000 })

    assert.equal(pageCollection.getCurrentPage()?.isTracked, false)
    assert.equal(pageCollection.getCurrentPage()?.updateIntervalId, undefined)
    assert.equal(intervalCalls, 0)
    assert.equal(collected.length, 0)
  } finally {
    pageCollection.stop()
    globalThis.setInterval = originalSetInterval
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})
