import test from 'node:test'
import assert from 'node:assert/strict'
import { createTimer } from '../packages/core/src/tools/timer'

test('createTimer executes callback after delay', async () => {
  let called = false
  createTimer(() => {
    called = true
  }, 10)

  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(called, true)
})

test('createTimer clear prevents callback', async () => {
  let called = false
  const timer = createTimer(() => {
    called = true
  }, 50)

  timer.clear()
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal(called, false)
})
