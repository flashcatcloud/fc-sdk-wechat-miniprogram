import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generateTraceId,
  generateSpanId,
  createTraceContext,
  createChildSpan,
  generateTraceparent,
  parseTraceparent,
  isValidTraceContext,
} from '../packages/core/src/domain/tracing/traceContext'

test('generateTraceId returns a decimal 64-bit identifier', () => {
  const traceId = generateTraceId()
  assert.ok(/^[1-9]\d*$/.test(traceId))
})

test('generateSpanId returns a decimal 63-bit identifier', () => {
  const spanId = generateSpanId()
  assert.ok(/^[1-9]\d*$/.test(spanId))
  assert.ok(BigInt(spanId) <= 0x7fffffffffffffffn)
})

test('createTraceContext creates valid sampled context', () => {
  const ctx = createTraceContext(true)
  assert.ok(/^[1-9]\d*$/.test(ctx.traceId))
  assert.ok(/^[1-9]\d*$/.test(ctx.spanId))
  assert.equal(ctx.traceFlags, '01')
  assert.equal(ctx.parentSpanId, undefined)
})

test('createTraceContext creates valid unsampled context', () => {
  const ctx = createTraceContext(false)
  assert.equal(ctx.traceFlags, '00')
})

test('createTraceContext defaults to sampled', () => {
  const ctx = createTraceContext()
  assert.equal(ctx.traceFlags, '01')
})

test('createChildSpan inherits traceId and traceFlags', () => {
  const parent = createTraceContext(true)
  const child = createChildSpan(parent)

  assert.equal(child.traceId, parent.traceId)
  assert.equal(child.traceFlags, parent.traceFlags)
  assert.equal(child.parentSpanId, parent.spanId)
  assert.notEqual(child.spanId, parent.spanId)
})

test('generateTraceparent creates valid W3C format', () => {
  const ctx = { traceId: '255', spanId: '1', traceFlags: '01' as const }
  const header = generateTraceparent(ctx)

  const parts = header.split('-')
  assert.equal(parts.length, 4)
  assert.equal(parts[0], '00')
  assert.equal(parts[1], '000000000000000000000000000000ff')
  assert.equal(parts[2], '0000000000000001')
  assert.equal(parts[3], ctx.traceFlags)
})

test('parseTraceparent parses valid header', () => {
  const header = '00-000000000000000000000000000000ff-0000000000000001-01'
  const ctx = parseTraceparent(header)

  assert.ok(ctx)
  assert.equal(ctx.traceId, '255')
  assert.equal(ctx.spanId, '1')
  assert.equal(ctx.traceFlags, '01')
})

test('parseTraceparent returns null for invalid version', () => {
  const header = '01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
  assert.equal(parseTraceparent(header), null)
})

test('parseTraceparent returns null for invalid traceId length', () => {
  const header = '00-0af7651916cd43dd-b7ad6b7169203331-01'
  assert.equal(parseTraceparent(header), null)
})

test('parseTraceparent returns null for invalid spanId length', () => {
  const header = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b71-01'
  assert.equal(parseTraceparent(header), null)
})

test('parseTraceparent returns null for invalid traceFlags', () => {
  const header = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-02'
  assert.equal(parseTraceparent(header), null)
})

test('parseTraceparent returns null for wrong format', () => {
  assert.equal(parseTraceparent('invalid'), null)
  assert.equal(parseTraceparent('00-abc-def'), null)
})

test('isValidTraceContext validates correct context', () => {
  const ctx = createTraceContext()
  assert.equal(isValidTraceContext(ctx), true)
})

test('isValidTraceContext rejects invalid traceId', () => {
  assert.equal(isValidTraceContext({
    traceId: 'invalid',
    spanId: '1',
    traceFlags: '01',
  }), false)
})

test('isValidTraceContext rejects invalid spanId', () => {
  assert.equal(isValidTraceContext({
    traceId: '255',
    spanId: 'invalid',
    traceFlags: '01',
  }), false)
})

test('roundtrip: generate and parse traceparent', () => {
  const original = createTraceContext(true)
  const header = generateTraceparent(original)
  const parsed = parseTraceparent(header)

  assert.ok(parsed)
  assert.equal(parsed.traceId, original.traceId)
  assert.equal(parsed.spanId, original.spanId)
  assert.equal(parsed.traceFlags, original.traceFlags)
})
