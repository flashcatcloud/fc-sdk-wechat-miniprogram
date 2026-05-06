import test from 'node:test'
import assert from 'node:assert/strict'
import { createValueHistory } from '../packages/core/src/tools/valueHistory'

test('valueHistory add and find', () => {
  let time = 0
  const history = createValueHistory<string>(() => time)

  time = 100
  history.add('first')
  time = 200
  history.add('second')
  time = 300
  history.add('third')

  const entry = history.find(250)
  assert.ok(entry)
  assert.equal(entry.value, 'second')
  assert.equal(entry.startTime, 200)
})

test('valueHistory find returns latest entry at or before time', () => {
  let time = 0
  const history = createValueHistory<number>(() => time)

  time = 10
  history.add(1)
  time = 20
  history.add(2)
  time = 30
  history.add(3)

  assert.equal(history.find(30)?.value, 3)
  assert.equal(history.find(25)?.value, 2)
  assert.equal(history.find(15)?.value, 1)
  assert.equal(history.find(10)?.value, 1)
})

test('valueHistory find returns undefined for time before first entry', () => {
  let time = 100
  const history = createValueHistory<string>(() => time)

  history.add('first')

  assert.equal(history.find(50), undefined)
})

test('valueHistory find returns undefined for empty history', () => {
  const history = createValueHistory<string>(() => 0)
  assert.equal(history.find(100), undefined)
})

test('valueHistory handles complex values', () => {
  let time = 0
  const history = createValueHistory<{ id: number; name: string }>(() => time)

  time = 100
  history.add({ id: 1, name: 'first' })

  const entry = history.find(100)
  assert.ok(entry)
  assert.deepEqual(entry.value, { id: 1, name: 'first' })
})
