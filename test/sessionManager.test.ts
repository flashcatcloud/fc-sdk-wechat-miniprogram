import test from 'node:test'
import assert from 'node:assert/strict'
import { startSessionManager } from '../packages/core/src/domain/session/sessionManager'

function createMockStore() {
  let stored: any
  return {
    get: () => stored,
    set: (state: any) => { stored = state },
    clear: () => { stored = undefined },
    _getStored: () => stored,
  }
}

test('sessionManager renew creates new session', () => {
  const store = createMockStore()
  const manager = startSessionManager(store)

  const session = manager.renew()

  assert.ok(session.id)
  assert.ok(session.created)
  assert.ok(session.expireAt)
  assert.ok(session.expireAt > session.created)
})

test('sessionManager renew stores session', () => {
  const store = createMockStore()
  const manager = startSessionManager(store)

  const session = manager.renew()

  assert.deepEqual(store._getStored(), session)
})

test('sessionManager findTrackedSession returns valid session', () => {
  const store = createMockStore()
  const manager = startSessionManager(store)

  const created = manager.renew()
  const found = manager.findTrackedSession()

  assert.deepEqual(found, created)
})

test('sessionManager findTrackedSession returns undefined when no session', () => {
  const store = createMockStore()
  const manager = startSessionManager(store)

  const found = manager.findTrackedSession()

  assert.equal(found, undefined)
})

test('sessionManager findTrackedSession returns undefined for expired session', () => {
  const store = createMockStore()
  const manager = startSessionManager(store)

  // Create an already expired session
  store.set({
    id: 'expired-session',
    created: Date.now() - 60 * 60 * 1000,
    expireAt: Date.now() - 1000,
  })

  const found = manager.findTrackedSession()

  assert.equal(found, undefined)
})

test('sessionManager expire clears session', () => {
  const store = createMockStore()
  const manager = startSessionManager(store)

  manager.renew()
  assert.ok(store._getStored())

  manager.expire()
  assert.equal(store._getStored(), undefined)
})

test('sessionManager generates unique session ids', () => {
  const store = createMockStore()
  const manager = startSessionManager(store)

  const ids = new Set<string>()
  for (let i = 0; i < 100; i++) {
    const session = manager.renew()
    ids.add(session.id)
  }

  assert.equal(ids.size, 100)
})

test('sessionManager expand updates expiration with throttle', () => {
  const store = createMockStore()
  const manager = startSessionManager(store)

  const session = manager.renew()
  const oldExpireAt = session.expireAt

  // Mock time advancement
  const originalNow = Date.now
  try {
    // 1. First expand should skip because of renew
    Date.now = () => originalNow() + 1000
    manager.expand()
    assert.equal(store._getStored().expireAt, oldExpireAt)

    // 2. Expand after throttle period
    Date.now = () => originalNow() + 61 * 1000
    manager.expand()
    const expanded = store._getStored()
    assert.ok(expanded.expireAt > oldExpireAt)
    assert.equal(expanded.id, session.id)
  } finally {
    Date.now = originalNow
  }
})

test('sessionManager hard timeout', () => {
  const store = createMockStore()
  const manager = startSessionManager(store)

  // Create session 4 hours ago
  const fourHoursPlus = 4 * 60 * 60 * 1000 + 1000
  store.set({
    id: 'old-session',
    created: Date.now() - fourHoursPlus,
    expireAt: Date.now() + 1000,
  })

  const found = manager.findTrackedSession()
  assert.equal(found, undefined)
})
