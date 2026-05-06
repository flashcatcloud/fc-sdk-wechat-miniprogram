import test from 'node:test'
import assert from 'node:assert/strict'
import { Observable } from '../packages/core/src/tools/observable'

test('clear() removes all observers', () => {
  const observable = new Observable<number>()
  const received: number[] = []

  observable.subscribe((data) => received.push(data))
  observable.subscribe((data) => received.push(data * 10))

  observable.notify(1)
  assert.deepEqual(received, [1, 10])

  observable.clear()

  observable.notify(2)
  // No new values should be pushed after clear
  assert.deepEqual(received, [1, 10])
})

test('after clear(), notify() does not call any observers', () => {
  const observable = new Observable<string>()
  let callCount = 0

  observable.subscribe(() => { callCount++ })
  observable.subscribe(() => { callCount++ })
  observable.subscribe(() => { callCount++ })

  observable.notify('a')
  assert.equal(callCount, 3)

  observable.clear()
  callCount = 0

  observable.notify('b')
  observable.notify('c')
  assert.equal(callCount, 0)
})

test('clear() triggers onLastUnsubscribe callback', () => {
  let cleanupCalled = false
  const observable = new Observable<number>(() => {
    return () => {
      cleanupCalled = true
    }
  })

  observable.subscribe(() => {})
  assert.equal(cleanupCalled, false)

  observable.clear()
  assert.equal(cleanupCalled, true)
})

test('Observable can be used again after clear() by subscribing new observers', () => {
  const observable = new Observable<number>()
  const received: number[] = []

  const sub = observable.subscribe((data) => received.push(data))
  observable.notify(1)
  assert.deepEqual(received, [1])

  observable.clear()
  observable.notify(2)
  assert.deepEqual(received, [1]) // still only [1]

  // Subscribe a new observer after clear
  const received2: number[] = []
  observable.subscribe((data) => received2.push(data))

  observable.notify(3)
  // The old observer from before clear is gone
  assert.deepEqual(received, [1])
  // The new observer receives the notification
  assert.deepEqual(received2, [3])
})
