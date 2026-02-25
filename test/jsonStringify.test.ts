import test from 'node:test'
import assert from 'node:assert/strict'
import { jsonStringify } from '../packages/core/src/tools/serialisation/jsonStringify'

test('jsonStringify serializes objects', () => {
  const result = jsonStringify({ a: 1, b: 'hello' })
  assert.equal(result, '{"a":1,"b":"hello"}')
})

test('jsonStringify serializes arrays', () => {
  const result = jsonStringify([1, 2, 3])
  assert.equal(result, '[1,2,3]')
})

test('jsonStringify serializes primitives', () => {
  assert.equal(jsonStringify('hello'), '"hello"')
  assert.equal(jsonStringify(123), '123')
  assert.equal(jsonStringify(true), 'true')
  assert.equal(jsonStringify(null), 'null')
})

test('jsonStringify returns undefined for circular references', () => {
  const obj: any = { a: 1 }
  obj.self = obj
  const result = jsonStringify(obj)
  assert.equal(result, undefined)
})

test('jsonStringify handles nested objects', () => {
  const result = jsonStringify({ nested: { deep: { value: 42 } } })
  assert.equal(result, '{"nested":{"deep":{"value":42}}}')
})
