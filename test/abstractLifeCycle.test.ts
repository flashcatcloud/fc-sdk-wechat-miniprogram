import test from 'node:test'
import assert from 'node:assert/strict'
import { AbstractLifeCycle } from '../packages/core/src/tools/abstractLifeCycle'

type TestEventMap = {
  event1: string
  event2: number
  event3: { name: string; value: number }
}

test('AbstractLifeCycle subscribe and notify', () => {
  const lifeCycle = new AbstractLifeCycle<TestEventMap>()
  const received: string[] = []

  lifeCycle.subscribe('event1', (data) => {
    received.push(data)
  })

  lifeCycle.notify('event1', 'hello')
  lifeCycle.notify('event1', 'world')

  assert.deepEqual(received, ['hello', 'world'])
})

test('AbstractLifeCycle different event types', () => {
  const lifeCycle = new AbstractLifeCycle<TestEventMap>()
  const strings: string[] = []
  const numbers: number[] = []

  lifeCycle.subscribe('event1', (data) => strings.push(data))
  lifeCycle.subscribe('event2', (data) => numbers.push(data))

  lifeCycle.notify('event1', 'test')
  lifeCycle.notify('event2', 42)

  assert.deepEqual(strings, ['test'])
  assert.deepEqual(numbers, [42])
})

test('AbstractLifeCycle complex event data', () => {
  const lifeCycle = new AbstractLifeCycle<TestEventMap>()
  const received: Array<{ name: string; value: number }> = []

  lifeCycle.subscribe('event3', (data) => received.push(data))

  lifeCycle.notify('event3', { name: 'metric', value: 100 })

  assert.deepEqual(received, [{ name: 'metric', value: 100 }])
})

test('AbstractLifeCycle unsubscribe stops notifications', () => {
  const lifeCycle = new AbstractLifeCycle<TestEventMap>()
  const received: string[] = []

  const subscription = lifeCycle.subscribe('event1', (data) => {
    received.push(data)
  })

  lifeCycle.notify('event1', 'before')
  subscription.unsubscribe()
  lifeCycle.notify('event1', 'after')

  assert.deepEqual(received, ['before'])
})

test('AbstractLifeCycle multiple subscribers same event', () => {
  const lifeCycle = new AbstractLifeCycle<TestEventMap>()
  const received1: string[] = []
  const received2: string[] = []

  lifeCycle.subscribe('event1', (data) => received1.push(data))
  lifeCycle.subscribe('event1', (data) => received2.push(data))

  lifeCycle.notify('event1', 'broadcast')

  assert.deepEqual(received1, ['broadcast'])
  assert.deepEqual(received2, ['broadcast'])
})
