import test from 'node:test'
import assert from 'node:assert/strict'
import { createValueHistory } from '../packages/core/src/tools/valueHistory'

test('valueHistory add and find', () => {
  let time = 0
  const history = createValueHistory<string>(() => time, { expireDelay: 300_000 })

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
  const history = createValueHistory<number>(() => time, { expireDelay: 300_000 })

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
  const history = createValueHistory<string>(() => time, { expireDelay: 300_000 })

  history.add('first')

  assert.equal(history.find(50), undefined)
})

test('valueHistory find returns undefined for empty history', () => {
  const history = createValueHistory<string>(() => 0, { expireDelay: 300_000 })
  assert.equal(history.find(100), undefined)
  history.stop()
})

test('valueHistory handles complex values', () => {
  let time = 0
  const history = createValueHistory<{ id: number; name: string }>(() => time, { expireDelay: 300_000 })

  time = 100
  history.add({ id: 1, name: 'first' })

  const entry = history.find(100)
  assert.ok(entry)
  assert.deepEqual(entry.value, { id: 1, name: 'first' })
  history.stop()
})

test('valueHistory closeActive sets endTime on active entry', () => {
  let time = 0
  const history = createValueHistory<string>(() => time, { expireDelay: 300_000 })

  time = 100
  history.add('active')

  assert.equal(history.find(100)?.value, 'active')
  assert.equal(history.find(200)?.value, 'active')

  history.closeActive(150)

  assert.equal(history.find(100)?.value, 'active')
  assert.equal(history.find(149)?.value, 'active')
  assert.equal(history.find(150), undefined)

  history.stop()
})

test('valueHistory respects maxEntries', () => {
  let time = 0
  const history = createValueHistory<number>(() => time, { expireDelay: 300_000, maxEntries: 2 })

  time = 10
  history.add(1)
  time = 20
  history.add(2)
  time = 30
  history.add(3)

  assert.equal(history.find(10), undefined)
  assert.equal(history.find(20)?.value, 2)
  assert.equal(history.find(30)?.value, 3)

  history.stop()
})

test('valueHistory clearExpiredValues removes old entries', () => {
  let time = 100_000
  const history = createValueHistory<string>(() => time, { expireDelay: 1000 })

  history.add('old')
  time = 102_000
  history.closeActive(101_500)

  history.add('recent')

  const entry = history.find(102_000)
  assert.ok(entry)
  assert.equal(entry.value, 'recent')

  // Simulate eviction: old entry with endTime < threshold should be gone
  // threshold = 102_000 - 1000 = 101_000, old entry endTime = 101_500 > 101_000, so still present
  assert.equal(history.find(100_500)?.value, 'old')

  time = 103_000
  assert.equal(history.find(100_500), undefined)

  history.stop()
})
