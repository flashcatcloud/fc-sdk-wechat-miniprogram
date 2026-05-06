import test from 'node:test'
import assert from 'node:assert/strict'
import { createBoundedBuffer } from '../packages/core/src/tools/boundedBuffer'

test('boundedBuffer add and drain', () => {
  const buffer = createBoundedBuffer<number>(10)
  buffer.add(1)
  buffer.add(2)
  buffer.add(3)

  const items = buffer.drain()
  assert.deepEqual(items, [1, 2, 3])
})

test('boundedBuffer drain empties buffer', () => {
  const buffer = createBoundedBuffer<number>(10)
  buffer.add(1)
  buffer.add(2)

  buffer.drain()
  const items = buffer.drain()

  assert.deepEqual(items, [])
})

test('boundedBuffer respects size limit', () => {
  const buffer = createBoundedBuffer<number>(3)
  buffer.add(1)
  buffer.add(2)
  buffer.add(3)
  buffer.add(4)
  buffer.add(5)

  const items = buffer.drain()
  assert.deepEqual(items, [3, 4, 5])
})

test('boundedBuffer drops oldest items when full', () => {
  const buffer = createBoundedBuffer<string>(2)
  buffer.add('a')
  buffer.add('b')
  buffer.add('c')

  const items = buffer.drain()
  assert.deepEqual(items, ['b', 'c'])
})

test('boundedBuffer with size 1', () => {
  const buffer = createBoundedBuffer<number>(1)
  buffer.add(1)
  buffer.add(2)
  buffer.add(3)

  const items = buffer.drain()
  assert.deepEqual(items, [3])
})

test('boundedBuffer handles complex objects', () => {
  const buffer = createBoundedBuffer<{ id: number; name: string }>(2)
  buffer.add({ id: 1, name: 'first' })
  buffer.add({ id: 2, name: 'second' })

  const items = buffer.drain()
  assert.deepEqual(items, [
    { id: 1, name: 'first' },
    { id: 2, name: 'second' },
  ])
})
