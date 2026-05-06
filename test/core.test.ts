import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAndBuildConfiguration, startSessionManager } from '../packages/core/src/index'

test('validateAndBuildConfiguration returns undefined when required fields missing', () => {
  const config = validateAndBuildConfiguration({
    clientToken: '',
    applicationId: '',
    endpoint: '',
  })
  assert.equal(config, undefined)
})

test('session manager renew creates session and stores it', () => {
  let stored: any
  const manager = startSessionManager({
    get: () => stored,
    set: (state) => {
      stored = state
    },
    clear: () => {
      stored = undefined
    },
  })
  const session = manager.renew()
  assert.ok(session.id)
  assert.equal(stored.id, session.id)
})
