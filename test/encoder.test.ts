import test from 'node:test'
import assert from 'node:assert/strict'
import { createIdentityEncoder } from '../packages/core/src/tools/encoder'

test('encoder isEmpty is true initially', () => {
  const encoder = createIdentityEncoder()
  assert.equal(encoder.isEmpty, true)
})

test('encoder isEmpty is false after write', () => {
  const encoder = createIdentityEncoder()
  encoder.write('data')
  assert.equal(encoder.isEmpty, false)
})

test('encoder write accumulates data', () => {
  const encoder = createIdentityEncoder()
  encoder.write('hello')
  encoder.write(' ')
  encoder.write('world')

  encoder.finish((result) => {
    assert.equal(result.output, 'hello world')
    assert.equal(result.outputBytesCount, 11)
  })
})

test('encoder finish clears buffer', () => {
  const encoder = createIdentityEncoder()
  encoder.write('data')

  encoder.finish(() => {})
  assert.equal(encoder.isEmpty, true)
})

test('encoder write calls onFlush with byte count', () => {
  const encoder = createIdentityEncoder()
  let flushedBytes = 0

  encoder.write('hello', (bytes) => {
    flushedBytes = bytes
  })

  assert.equal(flushedBytes, 5)
})

test('encoder finish returns correct byte count', () => {
  const encoder = createIdentityEncoder()
  encoder.write('test data')

  encoder.finish((result) => {
    assert.equal(result.outputBytesCount, 9)
  })
})
