import test from 'node:test'
import assert from 'node:assert/strict'
import { LifeCycle, LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import { startErrorCollection } from '../packages/miniprogram-rum/src/domain/error/errorCollection'

test('errorCollection addError with string message', () => {
  const lifeCycle = new LifeCycle()
  const collected: any[] = []

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => {
    collected.push(event)
  })

  const { addError } = startErrorCollection(lifeCycle)
  addError('Test error message', 'custom')

  assert.equal(collected.length, 1)
  assert.equal(collected[0].type, 'error')
  assert.equal(collected[0].error.message, 'Test error message')
  assert.equal(collected[0].error.source, 'custom')
})

test('errorCollection addError with Error object', () => {
  const lifeCycle = new LifeCycle()
  const collected: any[] = []

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => {
    collected.push(event)
  })

  const { addError } = startErrorCollection(lifeCycle)
  const error = new Error('Error object message')
  addError(error, 'app')

  assert.equal(collected.length, 1)
  assert.equal(collected[0].error.message, 'Error object message')
  assert.equal(collected[0].error.source, 'app')
  assert.ok(collected[0].error.stack)
})

test('errorCollection addError with stack string', () => {
  const lifeCycle = new LifeCycle()
  const collected: any[] = []

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => {
    collected.push(event)
  })

  const { addError } = startErrorCollection(lifeCycle)
  addError('Error with stack', 'promise', 'at line 1\nat line 2')

  assert.equal(collected.length, 1)
  assert.equal(collected[0].error.stack, 'at line 1\nat line 2')
})

test('errorCollection addError with fingerprint option', () => {
  const lifeCycle = new LifeCycle()
  const collected: any[] = []

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => {
    collected.push(event)
  })

  const { addError } = startErrorCollection(lifeCycle)
  addError('Error with fingerprint', 'custom', { fingerprint: 'custom-fingerprint-123' })

  assert.equal(collected.length, 1)
  assert.equal(collected[0].error.fingerprint, 'custom-fingerprint-123')
})

test('errorCollection addError with dd_fingerprint on Error', () => {
  const lifeCycle = new LifeCycle()
  const collected: any[] = []

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => {
    collected.push(event)
  })

  const { addError } = startErrorCollection(lifeCycle)
  const error = new Error('Error with dd_fingerprint') as any
  error.dd_fingerprint = 'dd-fingerprint-456'
  addError(error, 'app')

  assert.equal(collected.length, 1)
  assert.equal(collected[0].error.fingerprint, 'dd-fingerprint-456')
})

test('errorCollection notifies ERROR_COLLECTED event', () => {
  const lifeCycle = new LifeCycle()
  const errorEvents: any[] = []

  lifeCycle.subscribe(LifeCycleEventType.ERROR_COLLECTED, (event) => {
    errorEvents.push(event)
  })

  const { addError } = startErrorCollection(lifeCycle)
  addError('Test error', 'custom')

  assert.equal(errorEvents.length, 1)
  assert.equal(errorEvents[0].message, 'Test error')
  assert.equal(errorEvents[0].source, 'custom')
})

test('errorCollection supports different error sources', () => {
  const lifeCycle = new LifeCycle()
  const collected: any[] = []

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => {
    collected.push(event)
  })

  const { addError } = startErrorCollection(lifeCycle)
  addError('App error', 'app')
  addError('Promise error', 'promise')
  addError('Custom error', 'custom')

  assert.equal(collected.length, 3)
  assert.equal(collected[0].error.source, 'app')
  assert.equal(collected[1].error.source, 'promise')
  assert.equal(collected[2].error.source, 'custom')
})
