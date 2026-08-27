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

test('sessionManager findTrackedSession returns undefined for sampled-out session', () => {
  const store = createMockStore()
  const manager = startSessionManager(store, { sessionSampleRate: 0 })

  const created = manager.renew()
  const found = manager.findTrackedSession()

  assert.equal(created.isTracked, false)
  assert.equal(found, undefined)
})

test('sessionManager keeps sampled-out session valid without drawing again', () => {
  const store = createMockStore()
  const originalRandom = Math.random
  let configurationReads = 0
  Math.random = () => 0.75

  try {
    const manager = startSessionManager(store, {
      getSessionConfiguration: () => {
        configurationReads += 1
        return { sessionSampleRate: 50, rcVersion: 1 }
      },
    })
    const created = manager.renew()

    assert.equal(created.isTracked, false)
    assert.equal(manager.findSession()?.id, created.id)
    assert.equal(manager.findSession()?.id, created.id)
    assert.equal(manager.findTrackedSession(), undefined)
    assert.equal(configurationReads, 1)
  } finally {
    Math.random = originalRandom
  }
})

test('sessionManager locks rate and remote version once per new session', () => {
  const store = createMockStore()
  let snapshot = { sessionSampleRate: 100, rcVersion: 3 }
  const manager = startSessionManager(store, { getSessionConfiguration: () => snapshot })

  const first = manager.renew()
  snapshot = { sessionSampleRate: 0, rcVersion: 4 }

  assert.equal(manager.findSession()?.sessionSampleRate, 100)
  assert.equal(manager.findSession()?.rcVersion, 3)

  manager.expire()
  const second = manager.renew()
  assert.equal(second.sessionSampleRate, 0)
  assert.equal(second.rcVersion, 4)
  assert.equal(second.isTracked, false)
})

test('sessionManager normalizes legacy session metadata without changing its draw', () => {
  const store = createMockStore()
  store.set({
    id: 'legacy-session',
    created: Date.now(),
    expireAt: Date.now() + 60_000,
    isTracked: false,
  })

  const manager = startSessionManager(store, {
    sessionSampleRate: 67,
    getSessionConfiguration: () => ({ sessionSampleRate: 100, rcVersion: 9 }),
  })

  const session = manager.findSession()
  assert.equal(session?.id, 'legacy-session')
  assert.equal(session?.isTracked, false)
  assert.equal(session?.sessionSampleRate, 67)
  assert.equal(session?.rcVersion, 0)
})

test('sessionManager does not rewrite a current-format initial session', () => {
  const stored = {
    id: 'current-session',
    created: Date.now(),
    expireAt: Date.now() + 60_000,
    isTracked: true,
    sessionSampleRate: 50,
    rcVersion: 2,
  }
  let writes = 0
  const manager = startSessionManager({
    get: () => stored,
    set: () => {
      writes += 1
    },
    clear: () => undefined,
  })

  assert.equal(manager.findSession()?.id, stored.id)
  assert.equal(writes, 0)
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

test('sessionManager historical lookup is not affected by later session object mutation', () => {
  const originalNow = Date.now
  Date.now = () => 1_000
  const store = createMockStore()
  const manager = startSessionManager(store)

  try {
    const session = manager.renew()
    session.expireAt = 60 * 60 * 1000

    assert.equal(manager.findTrackedSession(20 * 60 * 1000), undefined)
  } finally {
    Date.now = originalNow
  }
})

test('sessionManager historical lookup uses expanded expiration after session expansion', () => {
  const originalNow = Date.now
  Date.now = () => 1_000
  const store = createMockStore()
  const manager = startSessionManager(store)

  try {
    const session = manager.renew()

    Date.now = () => 62_000
    manager.expand()

    const found = manager.findTrackedSession(920_000)
    assert.equal(found?.id, session.id)
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

test('beforeSampling receives the initialization rate when no remote provider is set', () => {
  const store = createMockStore()
  const contexts: unknown[] = []
  const manager = startSessionManager(store, {
    sessionSampleRate: 61,
    beforeSampling: (context) => {
      contexts.push(context)
      return undefined
    },
  })

  const session = manager.renew()
  assert.deepEqual(contexts, [{ sessionSampleRate: 61, custom: null }])
  assert.equal(session.sessionSampleRate, 61)
})

test('beforeSampling receives the remote rate and custom of the session being created', () => {
  const store = createMockStore()
  const contexts: Array<{ sessionSampleRate: number; custom: Record<string, unknown> | null }> = []
  let snapshot = { sessionSampleRate: 30, rcVersion: 4, custom: { tier: 'gold' } as Record<string, unknown> | null }
  const manager = startSessionManager(store, {
    sessionSampleRate: 61,
    getSessionConfiguration: () => snapshot,
    beforeSampling: (context) => {
      contexts.push(context)
      return undefined
    },
  })

  manager.renew()
  snapshot = { sessionSampleRate: 70, rcVersion: 5, custom: null }
  manager.expire()
  manager.renew()

  assert.deepEqual(contexts, [
    { sessionSampleRate: 30, custom: { tier: 'gold' } },
    { sessionSampleRate: 70, custom: null },
  ])
})

test('beforeSampling receives a copy of custom that cannot mutate the provider snapshot', () => {
  const store = createMockStore()
  const snapshot = { sessionSampleRate: 100, rcVersion: 1, custom: { tier: 'gold' } as Record<string, unknown> }
  const manager = startSessionManager(store, {
    getSessionConfiguration: () => snapshot,
    beforeSampling: (context) => {
      ;(context.custom as Record<string, unknown>).tier = 'bronze'
      return undefined
    },
  })

  manager.renew()
  assert.deepEqual(snapshot.custom, { tier: 'gold' })
})

test('beforeSampling overrides the rate used for the single draw', () => {
  const store = createMockStore()
  const manager = startSessionManager(store, {
    sessionSampleRate: 100,
    beforeSampling: () => 0,
  })

  const session = manager.renew()
  assert.equal(session.sessionSampleRate, 0)
  assert.equal(session.isTracked, false)
  assert.equal(manager.findTrackedSession(), undefined)
})

test('beforeSampling falls back to the incoming rate for invalid results and thrown errors', () => {
  const invalidResults: unknown[] = [
    undefined,
    null,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
    101,
    '50',
    {},
  ]

  for (const result of invalidResults) {
    const manager = startSessionManager(createMockStore(), {
      sessionSampleRate: 100,
      beforeSampling: () => result as number | undefined,
    })
    const session = manager.renew()
    assert.equal(session.sessionSampleRate, 100, `result ${JSON.stringify(result)}`)
    assert.equal(session.isTracked, true, `result ${JSON.stringify(result)}`)
  }

  const throwing = startSessionManager(createMockStore(), {
    sessionSampleRate: 100,
    beforeSampling: () => {
      throw new Error('host callback failed')
    },
  })
  let session!: ReturnType<typeof throwing.renew>
  assert.doesNotThrow(() => {
    session = throwing.renew()
  })
  assert.equal(session.sessionSampleRate, 100)
  assert.equal(session.isTracked, true)
})

test('beforeSampling accepts the boundary rates 0 and 100', () => {
  const zero = startSessionManager(createMockStore(), { sessionSampleRate: 100, beforeSampling: () => 0 })
  assert.equal(zero.renew().isTracked, false)

  const hundred = startSessionManager(createMockStore(), { sessionSampleRate: 0, beforeSampling: () => 100 })
  assert.equal(hundred.renew().isTracked, true)
})

test('setForcedSession leaves the current session untouched and forces only the next one', () => {
  const store = createMockStore()
  const manager = startSessionManager(store, { sessionSampleRate: 0 })

  const current = manager.renew()
  assert.equal(current.isTracked, false)

  manager.setForcedSession()
  assert.equal(manager.findSession()?.id, current.id)
  assert.equal(manager.findSession()?.isTracked, false)
  assert.equal(manager.findTrackedSession(), undefined)

  manager.expire()
  const forced = manager.renew()
  assert.equal(forced.isTracked, true)
  assert.equal(forced.sessionSampleRate, 0)
  assert.equal(manager.findTrackedSession()?.id, forced.id)

  manager.expire()
  const afterForced = manager.renew()
  assert.equal(afterForced.isTracked, false)
})

test('setForcedSession before any session is created forces that first session', () => {
  const manager = startSessionManager(createMockStore(), { sessionSampleRate: 0 })

  manager.setForcedSession()
  assert.equal(manager.renew().isTracked, true)
})

test('setForcedSession is idempotent and consumed by a single session', () => {
  const manager = startSessionManager(createMockStore(), { sessionSampleRate: 0 })

  manager.renew()
  manager.setForcedSession()
  manager.setForcedSession()

  manager.expire()
  assert.equal(manager.renew().isTracked, true)
  manager.expire()
  assert.equal(manager.renew().isTracked, false)
})

test('setForcedSession takes precedence over a beforeSampling rate of 0', () => {
  const manager = startSessionManager(createMockStore(), {
    sessionSampleRate: 100,
    beforeSampling: () => 0,
  })

  manager.renew()
  manager.setForcedSession()
  manager.expire()

  const forced = manager.renew()
  assert.equal(forced.isTracked, true)
  assert.equal(forced.sessionSampleRate, 0)
})

test('sessionManager is silent by default', () => {
  const store = createMockStore()
  const manager = startSessionManager(store)
  const originalLog = console.log
  const logs: unknown[][] = []

  try {
    console.log = (...args: unknown[]) => {
      logs.push(args)
    }
    manager.findTrackedSession()
    manager.renew()
  } finally {
    console.log = originalLog
  }

  assert.equal(logs.length, 0)
})

test('sessionManager logs the resolved sessionSampleRate when debug is enabled', () => {
  const originalLog = console.log
  const logs: unknown[][] = []
  console.log = (...args: unknown[]) => logs.push(args)

  try {
    const initOnly = startSessionManager(createMockStore(), {
      sessionSampleRate: 40,
      debug: true,
    })
    initOnly.renew()

    const remote = startSessionManager(createMockStore(), {
      sessionSampleRate: 40,
      getSessionConfiguration: () => ({ sessionSampleRate: 12, rcVersion: 7 }),
      debug: true,
    })
    remote.renew()

    const overridden = startSessionManager(createMockStore(), {
      sessionSampleRate: 40,
      getSessionConfiguration: () => ({ sessionSampleRate: 12, rcVersion: 7 }),
      beforeSampling: () => 88,
      debug: true,
    })
    overridden.renew()

    const restoredStore = createMockStore()
    restoredStore.set({
      id: 'existing',
      created: Date.now(),
      expireAt: Date.now() + 60_000,
      isTracked: true,
      sessionSampleRate: 67,
      rcVersion: 3,
    })
    startSessionManager(restoredStore, {
      sessionSampleRate: 40,
      getSessionConfiguration: () => ({ sessionSampleRate: 12, rcVersion: 7 }),
      debug: true,
    })
  } finally {
    console.log = originalLog
  }

  assert.deepEqual(logs, [
    ['[FlashCat RUM SDK][Debug] Using sessionSampleRate', 40],
    ['[FlashCat RUM SDK][Debug] Using sessionSampleRate', 12],
    ['[FlashCat RUM SDK][Debug] Using sessionSampleRate', 88],
    ['[FlashCat RUM SDK][Debug] Using sessionSampleRate', 67],
  ])
})
