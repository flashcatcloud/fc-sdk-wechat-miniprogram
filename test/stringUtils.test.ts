import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeString, generateUUID } from '../packages/core/src/tools/utils/stringUtils'

test('sanitizeString returns string as-is', () => {
  assert.equal(sanitizeString('hello'), 'hello')
  assert.equal(sanitizeString(''), '')
})

test('sanitizeString returns empty string for non-strings', () => {
  assert.equal(sanitizeString(123), '')
  assert.equal(sanitizeString(null), '')
  assert.equal(sanitizeString(undefined), '')
  assert.equal(sanitizeString({}), '')
  assert.equal(sanitizeString([]), '')
})

test('generateUUID returns valid UUID v4 format', () => {
  const uuid = generateUUID()
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  assert.ok(uuidRegex.test(uuid), `UUID ${uuid} should match v4 format`)
})

test('generateUUID returns unique values', () => {
  const uuids = new Set<string>()
  for (let i = 0; i < 100; i++) {
    uuids.add(generateUUID())
  }
  assert.equal(uuids.size, 100)
})
