import test from 'node:test'
import assert from 'node:assert/strict'
import { Observable, startSessionManager } from '../packages/core/src'
import type { ContextManager, SessionState } from '../packages/core/src'
import { LifeCycle, LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import { startPageCollection } from '../packages/miniprogram-rum/src/domain/page/pageCollection'
import { startRumAssembly } from '../packages/miniprogram-rum/src/domain/assembly'
import type { PageEvent, PlatformAdapter } from '../packages/miniprogram-platform/src'
import type { RumConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'
import type { RawRumViewEvent } from '../packages/miniprogram-rum/src/rawRumEvent.types'
import type { RumEvent } from '../packages/miniprogram-rum/src/rumEvent.types'

const FOUR_HOURS = 4 * 60 * 60 * 1000

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

test('starts a new view boundary when a session is renewed after the hard timeout', () => {
  const originalNow = Date.now
  const originalGetCurrentPages = (globalThis as any).getCurrentPages
  Date.now = () => 1_000
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/home/index' }]

  const lifeCycle = new LifeCycle()
  const pageObservable = new Observable<PageEvent>()
  const sessionManager = startSessionManager(createStore())
  const initialSession = sessionManager.renew()
  const pageCollection = startPageCollection(lifeCycle, pageObservable, configuration)
  const collected: RumEvent[] = []

  const assembly = startRumAssembly({
    lifeCycle,
    configuration,
    sessionManager,
    globalContext: createContextManager(),
    userContext: createContextManager(),
    getCurrentPage: pageCollection.getCurrentPage,
    adapter,
  })
  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => collected.push(event))

  try {
    pageObservable.notify({ route: 'pages/home/index', lifecycle: 'load', time: 1_000 })
    assert.equal(collected[0].session.id, initialSession.id)
    const oldViewId = collected[0].view.id
    collected.length = 0

    Date.now = () => 1_000 + FOUR_HOURS + 1
    const staleViewUpdate: RawRumViewEvent = {
      date: 1_000,
      type: 'view',
      _dd: {
        document_version: 1,
        format_version: 2,
        configuration: {
          session_sample_rate: 100,
          session_replay_sample_rate: 0,
          start_session_replay_recording_manually: false,
        },
      },
      view: {
        id: oldViewId,
        url: 'pages/home/index',
        name: 'pages/home/index',
        time_spent: (FOUR_HOURS + 1) * 1e6,
      },
    }

    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, staleViewUpdate)

    assert.equal(
      collected.some((event) => event.view.id === oldViewId && event.view.time_spent === staleViewUpdate.view.time_spent),
      false,
    )
    assert.equal(collected.length, 1)
    assert.notEqual(collected[0].session.id, initialSession.id)
    assert.notEqual(collected[0].view.id, oldViewId)
    assert.equal(collected[0].view.name, 'pages/home/index')
    assert.equal(collected[0].view.time_spent, undefined)
  } finally {
    assembly.stop()
    pageCollection.stop()
    Date.now = originalNow
    ;(globalThis as any).getCurrentPages = originalGetCurrentPages
  }
})
