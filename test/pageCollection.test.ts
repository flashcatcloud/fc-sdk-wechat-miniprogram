import test from 'node:test'
import assert from 'node:assert/strict'
import { Observable } from '../packages/core/src'
import { LifeCycle, LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import { startPageCollection } from '../packages/miniprogram-rum/src/domain/page/pageCollection'
import type { PageEvent } from '../packages/miniprogram-platform/src'
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

    assert.equal((collected[0] as RawRumViewEvent).view.loading_type, 'initial_load')
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
