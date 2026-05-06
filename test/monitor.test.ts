import test from 'node:test'
import assert from 'node:assert/strict'
import { monitor, callMonitored, monitorError } from '../packages/core/src/tools/monitor'

test('monitor wraps function and returns result', () => {
  const fn = (a: number, b: number) => a + b
  const monitored = monitor(fn)

  assert.equal(monitored(2, 3), 5)
})

test('monitor preserves function behavior', () => {
  const fn = (str: string) => str.toUpperCase()
  const monitored = monitor(fn)

  assert.equal(monitored('hello'), 'HELLO')
})

test('monitor rethrows errors', () => {
  const fn = () => {
    throw new Error('test error')
  }
  const monitored = monitor(fn)

  assert.throws(() => monitored(), { message: 'test error' })
})

test('callMonitored executes function', () => {
  let called = false
  callMonitored(() => {
    called = true
  })

  assert.equal(called, true)
})

test('monitorError logs to console', () => {
  const originalError = console.error
  let logged: unknown
  console.error = (msg: unknown) => {
    logged = msg
  }

  const error = new Error('test')
  monitorError(error)

  assert.equal(logged, error)
  console.error = originalError
})
