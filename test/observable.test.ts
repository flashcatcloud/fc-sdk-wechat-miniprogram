import test from 'node:test'
import assert from 'node:assert/strict'
import { Observable, mergeObservables } from '../packages/core/src/tools/observable'

test('Observable subscribe and notify', () => {
  const observable = new Observable<number>()
  const received: number[] = []

  observable.subscribe((data) => {
    received.push(data)
  })

  observable.notify(1)
  observable.notify(2)
  observable.notify(3)

  assert.deepEqual(received, [1, 2, 3])
})

test('Observable multiple subscribers', () => {
  const observable = new Observable<string>()
  const received1: string[] = []
  const received2: string[] = []

  observable.subscribe((data) => received1.push(data))
  observable.subscribe((data) => received2.push(data))

  observable.notify('hello')

  assert.deepEqual(received1, ['hello'])
  assert.deepEqual(received2, ['hello'])
})

test('Observable unsubscribe stops notifications', () => {
  const observable = new Observable<number>()
  const received: number[] = []

  const subscription = observable.subscribe((data) => {
    received.push(data)
  })

  observable.notify(1)
  subscription.unsubscribe()
  observable.notify(2)

  assert.deepEqual(received, [1])
})

test('Observable onFirstSubscribe called on first subscriber', () => {
  let firstSubscribeCalled = false
  const observable = new Observable<number>(() => {
    firstSubscribeCalled = true
  })

  assert.equal(firstSubscribeCalled, false)
  observable.subscribe(() => {})
  assert.equal(firstSubscribeCalled, true)
})

test('Observable onLastUnsubscribe called when all unsubscribe', () => {
  let cleanupCalled = false
  const observable = new Observable<number>(() => {
    return () => {
      cleanupCalled = true
    }
  })

  const sub1 = observable.subscribe(() => {})
  const sub2 = observable.subscribe(() => {})

  sub1.unsubscribe()
  assert.equal(cleanupCalled, false)

  sub2.unsubscribe()
  assert.equal(cleanupCalled, true)
})

test('mergeObservables combines multiple observables', () => {
  const obs1 = new Observable<number>()
  const obs2 = new Observable<number>()
  const merged = mergeObservables(obs1, obs2)

  const received: number[] = []
  merged.subscribe((data) => received.push(data))

  obs1.notify(1)
  obs2.notify(2)
  obs1.notify(3)

  assert.deepEqual(received, [1, 2, 3])
})

test('mergeObservables unsubscribe cleans up all', () => {
  let cleanup1 = false
  let cleanup2 = false

  const obs1 = new Observable<number>(() => () => { cleanup1 = true })
  const obs2 = new Observable<number>(() => () => { cleanup2 = true })
  const merged = mergeObservables(obs1, obs2)

  const sub = merged.subscribe(() => {})
  sub.unsubscribe()

  assert.equal(cleanup1, true)
  assert.equal(cleanup2, true)
})
