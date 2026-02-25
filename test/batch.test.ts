import test from 'node:test'
import assert from 'node:assert/strict'
import { createBatch } from '../packages/core/src/transport/batch'
import { createIdentityEncoder } from '../packages/core/src/tools/encoder'
import { Observable } from '../packages/core/src/tools/observable'

function createMockFlushController() {
  const flushObservable = new Observable<{ reason: string }>()
  return {
    flushObservable,
    notifyBeforeAddMessage: () => {},
    notifyAfterAddMessage: () => {},
    triggerFlush: (reason: string) => flushObservable.notify({ reason }),
  }
}

function createMockRequest() {
  const sent: any[] = []
  const sentOnExit: any[] = []
  return {
    send: (payload: any) => sent.push(payload),
    sendOnExit: (payload: any) => sentOnExit.push(payload),
    getSent: () => sent,
    getSentOnExit: () => sentOnExit,
  }
}

test('batch add serializes and encodes message', () => {
  const encoder = createIdentityEncoder()
  const request = createMockRequest()
  const controller = createMockFlushController()

  const batch = createBatch({
    encoder,
    request,
    flushController: controller,
    messageBytesLimit: 1000,
  })

  batch.add({ type: 'test', value: 123 })
  controller.triggerFlush('timer')

  assert.equal(request.getSent().length, 1)
  assert.ok(request.getSent()[0].data.includes('"type":"test"'))
})

test('batch add multiple messages with newline separator', () => {
  const encoder = createIdentityEncoder()
  const request = createMockRequest()
  const controller = createMockFlushController()

  const batch = createBatch({
    encoder,
    request,
    flushController: controller,
    messageBytesLimit: 1000,
  })

  batch.add({ id: 1 })
  batch.add({ id: 2 })
  controller.triggerFlush('timer')

  const data = request.getSent()[0].data
  assert.ok(data.includes('\n'))
  assert.ok(data.includes('"id":1'))
  assert.ok(data.includes('"id":2'))
})

test('batch rejects messages exceeding limit', () => {
  const encoder = createIdentityEncoder()
  const request = createMockRequest()
  const controller = createMockFlushController()

  const batch = createBatch({
    encoder,
    request,
    flushController: controller,
    messageBytesLimit: 10,
  })

  batch.add({ longMessage: 'this is way too long for the limit' })
  controller.triggerFlush('timer')

  assert.equal(request.getSent().length, 0)
})

test('batch uses sendOnExit for page_exit reason', () => {
  const encoder = createIdentityEncoder()
  const request = createMockRequest()
  const controller = createMockFlushController()

  const batch = createBatch({
    encoder,
    request,
    flushController: controller,
    messageBytesLimit: 1000,
  })

  batch.add({ type: 'exit' })
  controller.triggerFlush('page_exit')

  assert.equal(request.getSent().length, 0)
  assert.equal(request.getSentOnExit().length, 1)
})

test('batch stop unsubscribes from flush', () => {
  const encoder = createIdentityEncoder()
  const request = createMockRequest()
  const controller = createMockFlushController()

  const batch = createBatch({
    encoder,
    request,
    flushController: controller,
    messageBytesLimit: 1000,
  })

  batch.add({ type: 'test' })
  batch.stop()
  controller.triggerFlush('timer')

  assert.equal(request.getSent().length, 0)
})

test('batch does not send empty payload', () => {
  const encoder = createIdentityEncoder()
  const request = createMockRequest()
  const controller = createMockFlushController()

  createBatch({
    encoder,
    request,
    flushController: controller,
    messageBytesLimit: 1000,
  })

  controller.triggerFlush('timer')

  assert.equal(request.getSent().length, 0)
})
