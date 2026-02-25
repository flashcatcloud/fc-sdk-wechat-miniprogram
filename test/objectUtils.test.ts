import test from 'node:test'
import assert from 'node:assert/strict'
import { shallowMerge } from '../packages/core/src/tools/utils/objectUtils'

test('shallowMerge combines two objects', () => {
  const target = { a: 1, b: 2 }
  const source = { c: 3, d: 4 }
  const result = shallowMerge(target, source)

  assert.deepEqual(result, { a: 1, b: 2, c: 3, d: 4 })
})

test('shallowMerge source overrides target', () => {
  const target = { a: 1, b: 2 }
  const source = { b: 3, c: 4 }
  const result = shallowMerge(target, source)

  assert.deepEqual(result, { a: 1, b: 3, c: 4 })
})

test('shallowMerge does not mutate original objects', () => {
  const target = { a: 1 }
  const source = { b: 2 }
  shallowMerge(target, source)

  assert.deepEqual(target, { a: 1 })
  assert.deepEqual(source, { b: 2 })
})

test('shallowMerge with empty objects', () => {
  assert.deepEqual(shallowMerge({}, { a: 1 }), { a: 1 })
  assert.deepEqual(shallowMerge({ a: 1 }, {}), { a: 1 })
  assert.deepEqual(shallowMerge({}, {}), {})
})
