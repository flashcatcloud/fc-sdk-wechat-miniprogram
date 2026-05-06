import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAndBuildRumConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'

test('tracing defaults to disabled', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
  })

  assert.ok(result)
  assert.equal(result.tracing.enabled, false)
})

test('tracing can be enabled', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
    tracing: { enabled: true },
  })

  assert.ok(result)
  assert.equal(result.tracing.enabled, true)
})

test('tracing sampleRate defaults to 1.0', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
    tracing: { enabled: true },
  })

  assert.ok(result)
  assert.equal(result.tracing.sampleRate, 1.0)
})

test('tracing sampleRate can be customized', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
    tracing: { enabled: true, sampleRate: 0.5 },
  })

  assert.ok(result)
  assert.equal(result.tracing.sampleRate, 0.5)
})

test('tracing headerName defaults to traceparent', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
    tracing: { enabled: true },
  })

  assert.ok(result)
  assert.equal(result.tracing.headerName, 'traceparent')
})

test('tracing headerName can be customized', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
    tracing: { enabled: true, headerName: 'x-trace-id' },
  })

  assert.ok(result)
  assert.equal(result.tracing.headerName, 'x-trace-id')
})

test('tracing rootTraceContext is optional', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
    tracing: { enabled: true },
  })

  assert.ok(result)
  assert.equal(result.tracing.rootTraceContext, undefined)
})

test('tracing rootTraceContext can be provided', () => {
  const rootContext = {
    traceId: '0af7651916cd43dd8448eb211c80319c',
    spanId: 'b7ad6b7169203331',
    traceFlags: '01' as const,
  }

  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
    tracing: { enabled: true, rootTraceContext: rootContext },
  })

  assert.ok(result)
  assert.deepEqual(result.tracing.rootTraceContext, rootContext)
})
