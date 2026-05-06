import test from 'node:test'
import assert from 'node:assert/strict'
import { createContextManager } from '../packages/core/src/domain/context/contextManager'

test('contextManager setContext replaces entire context', () => {
  const manager = createContextManager()
  manager.setContext({ a: 1, b: 2 })
  assert.deepEqual(manager.getContext(), { a: 1, b: 2 })

  manager.setContext({ c: 3 })
  assert.deepEqual(manager.getContext(), { c: 3 })
})

test('contextManager getContext returns copy', () => {
  const manager = createContextManager()
  manager.setContext({ a: 1 })
  const ctx = manager.getContext()
  ctx.a = 999
  assert.deepEqual(manager.getContext(), { a: 1 })
})

test('contextManager setContextProperty adds/updates property', () => {
  const manager = createContextManager()
  manager.setContextProperty('key1', 'value1')
  assert.deepEqual(manager.getContext(), { key1: 'value1' })

  manager.setContextProperty('key2', 'value2')
  assert.deepEqual(manager.getContext(), { key1: 'value1', key2: 'value2' })

  manager.setContextProperty('key1', 'updated')
  assert.deepEqual(manager.getContext(), { key1: 'updated', key2: 'value2' })
})

test('contextManager removeContextProperty removes property', () => {
  const manager = createContextManager()
  manager.setContext({ a: 1, b: 2, c: 3 })
  manager.removeContextProperty('b')
  assert.deepEqual(manager.getContext(), { a: 1, c: 3 })
})

test('contextManager clearContext empties context', () => {
  const manager = createContextManager()
  manager.setContext({ a: 1, b: 2 })
  manager.clearContext()
  assert.deepEqual(manager.getContext(), {})
})

test('contextManager handles complex values', () => {
  const manager = createContextManager()
  manager.setContext({
    nested: { deep: { value: 123 } },
    array: [1, 2, 3],
    nullValue: null,
  })
  const ctx = manager.getContext()
  assert.deepEqual(ctx.nested, { deep: { value: 123 } })
  assert.deepEqual(ctx.array, [1, 2, 3])
  assert.equal(ctx.nullValue, null)
})
