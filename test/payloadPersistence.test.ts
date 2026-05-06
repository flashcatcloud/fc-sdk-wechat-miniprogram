import test from 'node:test'
import assert from 'node:assert/strict'
import {
  persistPayload,
  loadAndClearPersistedPayloads,
  type StorageAdapter,
} from '../packages/core/src/transport/payloadPersistence'

function createMockStorage(): StorageAdapter & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>()
  return {
    store,
    setStorageSync(key: string, data: unknown) {
      store.set(key, data)
    },
    getStorageSync(key: string) {
      return store.get(key)
    },
    removeStorageSync(key: string) {
      store.delete(key)
    },
  }
}

function makePayload(data: string, bytesCount: number) {
  return { data, bytesCount }
}

test('persistPayload saves a payload and loadAndClearPersistedPayloads retrieves it', () => {
  const storage = createMockStorage()
  const payload = makePayload('test-data', 9)

  persistPayload(storage, payload)
  const loaded = loadAndClearPersistedPayloads(storage)

  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].data, 'test-data')
  assert.equal(loaded[0].bytesCount, 9)
})

test('loadAndClearPersistedPayloads clears stored data after loading', () => {
  const storage = createMockStorage()
  persistPayload(storage, makePayload('first', 5))

  const first = loadAndClearPersistedPayloads(storage)
  assert.equal(first.length, 1)

  const second = loadAndClearPersistedPayloads(storage)
  assert.equal(second.length, 0)
})

test('persistPayload evicts expired entries older than 24 hours', () => {
  const storage = createMockStorage()

  // Manually inject an expired entry into storage
  const expiredTimestamp = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
  storage.setStorageSync('__FC_RUM_PENDING_PAYLOADS__', [
    { data: 'expired', bytesCount: 7, timestamp: expiredTimestamp },
  ])

  persistPayload(storage, makePayload('fresh', 5))

  const loaded = loadAndClearPersistedPayloads(storage)
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].data, 'fresh')
})

test('persistPayload enforces max 10 payloads limit', () => {
  const storage = createMockStorage()

  // Persist 12 payloads; only the last 10 should remain
  for (let i = 0; i < 12; i++) {
    persistPayload(storage, makePayload(`payload-${i}`, 10))
  }

  const loaded = loadAndClearPersistedPayloads(storage)
  assert.equal(loaded.length, 10)
  assert.equal(loaded[0].data, 'payload-2')
  assert.equal(loaded[9].data, 'payload-11')
})

test('persistPayload enforces max 64 KiB total limit', () => {
  const storage = createMockStorage()

  // Each payload claims 20 KiB. Four of them = 80 KiB, which exceeds 64 KiB,
  // so the oldest should be evicted until total fits.
  persistPayload(storage, makePayload('block-a', 20 * 1024))
  persistPayload(storage, makePayload('block-b', 20 * 1024))
  persistPayload(storage, makePayload('block-c', 20 * 1024))
  persistPayload(storage, makePayload('block-d', 20 * 1024))

  const loaded = loadAndClearPersistedPayloads(storage)
  // After adding block-d total is 80 KiB; loop shifts until <= 64 KiB,
  // keeping block-b + block-c + block-d = 60 KiB
  assert.equal(loaded.length, 3)
  assert.equal(loaded[0].data, 'block-b')
  assert.equal(loaded[1].data, 'block-c')
  assert.equal(loaded[2].data, 'block-d')
})

test('loadAndClearPersistedPayloads returns empty array when storage is empty', () => {
  const storage = createMockStorage()
  const loaded = loadAndClearPersistedPayloads(storage)
  assert.deepEqual(loaded, [])
})

test('handles storage errors gracefully', () => {
  const storage: StorageAdapter = {
    setStorageSync() {
      throw new Error('storage full')
    },
    getStorageSync() {
      throw new Error('storage read error')
    },
    removeStorageSync() {
      throw new Error('storage remove error')
    },
  }

  // persistPayload should not throw
  assert.doesNotThrow(() => {
    persistPayload(storage, makePayload('x', 1))
  })

  // loadAndClearPersistedPayloads should return empty array
  const loaded = loadAndClearPersistedPayloads(storage)
  assert.deepEqual(loaded, [])
})
