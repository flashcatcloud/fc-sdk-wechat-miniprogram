import test from 'node:test'
import assert from 'node:assert/strict'
import { createFlushController } from '../packages/core/src/transport/flushController'

test('flushController notifies on timer', async () => {
  const controller = createFlushController({ flushInterval: 50, batchBytesLimit: 1000 })
  const events: string[] = []

  controller.flushObservable.subscribe((event) => {
    events.push(event.reason)
  })

  controller.notifyAfterAddMessage(1)
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.ok(events.includes('timer'))
})

test('flushController notifies on size limit', () => {
  const controller = createFlushController({ flushInterval: 10000, batchBytesLimit: 100 })
  const events: string[] = []

  controller.flushObservable.subscribe((event) => {
    events.push(event.reason)
  })

  controller.notifyAfterAddMessage(60)
  controller.notifyBeforeAddMessage(50)
  assert.ok(events.includes('size'))
})

test('flushController accumulates bytes', () => {
  const controller = createFlushController({ flushInterval: 10000, batchBytesLimit: 100 })
  const events: string[] = []

  controller.flushObservable.subscribe((event) => {
    events.push(event.reason)
  })

  controller.notifyBeforeAddMessage(30)
  controller.notifyAfterAddMessage(30)
  assert.equal(events.length, 0)

  controller.notifyBeforeAddMessage(30)
  controller.notifyAfterAddMessage(30)
  assert.equal(events.length, 0)

  controller.notifyBeforeAddMessage(50)
  assert.ok(events.includes('size'))
})

test('flushController notifyAfterAddMessage resets timer', async () => {
  const controller = createFlushController({ flushInterval: 50, batchBytesLimit: 1000 })
  const events: string[] = []

  controller.flushObservable.subscribe((event) => {
    events.push(event.reason)
  })

  // Keep resetting timer
  controller.notifyAfterAddMessage()
  await new Promise((resolve) => setTimeout(resolve, 30))
  controller.notifyAfterAddMessage()
  await new Promise((resolve) => setTimeout(resolve, 30))

  // Timer should not have fired yet
  assert.equal(events.filter((e) => e === 'timer').length, 0)

  // Wait for timer to fire
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.ok(events.includes('timer'))
})

test('flushController notifyAfterAddMessage adds delta bytes', () => {
  const controller = createFlushController({ flushInterval: 10000, batchBytesLimit: 100 })
  const events: string[] = []

  controller.flushObservable.subscribe((event) => {
    events.push(event.reason)
  })

  controller.notifyBeforeAddMessage(100)
  controller.notifyAfterAddMessage(100)

  // Total is now 100, should trigger size flush on next add
  controller.notifyBeforeAddMessage(1)
  assert.ok(events.includes('size'))
})

test('flushController notifies on messages limit', () => {
  const controller = createFlushController({ flushInterval: 10000, batchBytesLimit: 1000, messagesLimit: 3 })
  const events: string[] = []

  controller.flushObservable.subscribe((event) => {
    events.push(event.reason)
  })

  controller.notifyAfterAddMessage()
  controller.notifyAfterAddMessage()
  assert.equal(events.length, 0)

  controller.notifyAfterAddMessage()
  assert.ok(events.includes('messages_limit'))
})
