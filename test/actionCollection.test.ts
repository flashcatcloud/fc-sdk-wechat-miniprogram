import test from 'node:test'
import assert from 'node:assert/strict'
import { Observable } from '../packages/core/src/tools/observable'
import { LifeCycle, LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import { startActionCollection } from '../packages/miniprogram-rum/src/domain/action/actionCollection'
import type { UserActionEvent } from '../packages/miniprogram-platform/src/browser/pageObservable'

function makeActionEvent(overrides: Partial<UserActionEvent> = {}): UserActionEvent {
  return { route: '/pages/index', type: 'tap', time: Date.now(), ...overrides }
}

test('actionCollection emits RAW_RUM_EVENT_COLLECTED even when no page activity occurs', async () => {
  const lifeCycle = new LifeCycle()
  const actionObservable = new Observable<UserActionEvent>()
  const collected: any[] = []

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => collected.push(event))
  const { stop } = startActionCollection(lifeCycle, actionObservable)

  actionObservable.notify(makeActionEvent())

  // Wait past PAGE_ACTIVITY_VALIDATION_DELAY (100ms) so the idle timer fires
  await new Promise((resolve) => setTimeout(resolve, 200))

  stop()

  const actionEvents = collected.filter((e) => e.type === 'action' && e.action?.id)
  assert.equal(actionEvents.length, 1)
  assert.equal(actionEvents[0].action.type, 'tap')
  assert.equal(actionEvents[0].action.target.name, 'unknown')
})

test('actionCollection omits loading_time when no activity occurred', async () => {
  const lifeCycle = new LifeCycle()
  const actionObservable = new Observable<UserActionEvent>()
  const collected: any[] = []

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => collected.push(event))
  const { stop } = startActionCollection(lifeCycle, actionObservable)

  actionObservable.notify(makeActionEvent())

  await new Promise((resolve) => setTimeout(resolve, 200))
  stop()

  const actionEvent = collected.find((e) => e.type === 'action' && e.action?.id)
  assert.ok(actionEvent)
  assert.equal(actionEvent.action.loading_time, undefined)
})

test('actionCollection emits loading_time when request activity is detected', async () => {
  const lifeCycle = new LifeCycle()
  const actionObservable = new Observable<UserActionEvent>()
  const collected: any[] = []

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => collected.push(event))
  const { stop } = startActionCollection(lifeCycle, actionObservable)

  actionObservable.notify(makeActionEvent())

  // Simulate a request starting and completing to trigger activity
  lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, { url: 'https://api.example.com', method: 'GET', startTime: Date.now() })
  await new Promise((resolve) => setTimeout(resolve, 10))
  lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, { url: 'https://api.example.com', method: 'GET', startTime: Date.now(), duration: 10 })

  // Wait for end delay (100ms) to fire
  await new Promise((resolve) => setTimeout(resolve, 200))
  stop()

  const actionEvent = collected.find((e) => e.type === 'action' && e.action?.id)
  assert.ok(actionEvent)
  assert.ok(typeof actionEvent.action.loading_time === 'number', 'loading_time should be present when activity occurred')
})

test('actionCollection includes position when x/y are present', async () => {
  const lifeCycle = new LifeCycle()
  const actionObservable = new Observable<UserActionEvent>()
  const collected: any[] = []

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => collected.push(event))
  const { stop } = startActionCollection(lifeCycle, actionObservable)

  actionObservable.notify(makeActionEvent({ x: 100, y: 200 }))
  await new Promise((resolve) => setTimeout(resolve, 200))
  stop()

  const actionEvent = collected.find((e) => e.type === 'action' && e.action?.id)
  assert.ok(actionEvent)
  assert.deepEqual(actionEvent._dd?.action?.position, { x: 100, y: 200 })
})

test('actionCollection addAction emits custom action immediately', () => {
  const lifeCycle = new LifeCycle()
  const actionObservable = new Observable<UserActionEvent>()
  const collected: any[] = []

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => collected.push(event))
  const { addAction, stop } = startActionCollection(lifeCycle, actionObservable)

  addAction('Buy button')
  stop()

  const actionEvents = collected.filter((e) => e.type === 'action')
  assert.equal(actionEvents.length, 1)
  assert.equal(actionEvents[0].action.target.name, 'Buy button')
  assert.equal(actionEvents[0].action.type, 'custom')
})
