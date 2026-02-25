import test from 'node:test'
import assert from 'node:assert/strict'
import { createEventRateLimiter } from '../packages/core/src/domain/eventRateLimiter/createEventRateLimiter'

test('eventRateLimiter allows events under limit', () => {
  const errors: string[] = []
  const limiter = createEventRateLimiter('error', 3, (err) => {
    errors.push(err.message)
  })

  assert.equal(limiter.isLimitReached(), false)
  assert.equal(limiter.isLimitReached(), false)
  assert.equal(limiter.isLimitReached(), false)
  assert.equal(errors.length, 0)

  limiter.stop()
})

test('eventRateLimiter blocks events over limit', () => {
  const errors: string[] = []
  const limiter = createEventRateLimiter('action', 2, (err) => {
    errors.push(err.message)
  })

  assert.equal(limiter.isLimitReached(), false) // 1
  assert.equal(limiter.isLimitReached(), false) // 2
  assert.equal(limiter.isLimitReached(), true)  // 3 - blocked
  assert.equal(limiter.isLimitReached(), true)  // 4 - blocked

  limiter.stop()
})

test('eventRateLimiter calls onLimitReached once when limit exceeded', () => {
  const errors: string[] = []
  const limiter = createEventRateLimiter('request', 2, (err) => {
    errors.push(err.message)
  })

  limiter.isLimitReached() // 1
  limiter.isLimitReached() // 2
  limiter.isLimitReached() // 3 - triggers callback
  limiter.isLimitReached() // 4 - no callback
  limiter.isLimitReached() // 5 - no callback

  assert.equal(errors.length, 1)
  assert.ok(errors[0].includes('request'))
  assert.ok(errors[0].includes('2'))

  limiter.stop()
})

test('eventRateLimiter error message contains event type and limit', () => {
  let errorMessage = ''
  const limiter = createEventRateLimiter('custom', 5, (err) => {
    errorMessage = err.message
  })

  for (let i = 0; i < 6; i++) {
    limiter.isLimitReached()
  }

  assert.equal(errorMessage, 'Reached max number of customs by minute: 5')

  limiter.stop()
})

test('eventRateLimiter stop clears timer', () => {
  const limiter = createEventRateLimiter('error', 10, () => {})
  limiter.isLimitReached()
  limiter.stop()
  // No assertion needed - just verify no error thrown
})
