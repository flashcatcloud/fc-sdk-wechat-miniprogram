import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAndBuildConfiguration } from '../packages/core/src/domain/configuration/configuration'

test('validateAndBuildConfiguration returns undefined without clientToken', () => {
  const result = validateAndBuildConfiguration({
    clientToken: '',
    applicationId: 'app-123',
  })
  assert.equal(result, undefined)
})

test('validateAndBuildConfiguration returns undefined without applicationId', () => {
  const result = validateAndBuildConfiguration({
    clientToken: 'token-123',
    applicationId: '',
  })
  assert.equal(result, undefined)
})

test('validateAndBuildConfiguration returns config with valid input', () => {
  const result = validateAndBuildConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
  })

  assert.ok(result)
  assert.equal(result.clientToken, 'token-123')
  assert.equal(result.applicationId, 'app-123')
})

test('validateAndBuildConfiguration uses default sessionSampleRate', () => {
  const result = validateAndBuildConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
  })

  assert.ok(result)
  assert.equal(result.sessionSampleRate, 100)
})

test('validateAndBuildConfiguration uses custom sessionSampleRate', () => {
  const result = validateAndBuildConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
    sessionSampleRate: 50,
  })

  assert.ok(result)
  assert.equal(result.sessionSampleRate, 50)
})

test('validateAndBuildConfiguration rejects sessionSampleRate outside 0-100', () => {
  const originalError = console.error
  const errors: unknown[] = []
  console.error = (...args: unknown[]) => {
    errors.push(args[0])
  }

  try {
    const result = validateAndBuildConfiguration({
      clientToken: 'token-123',
      applicationId: 'app-123',
      sessionSampleRate: 200,
    })

    assert.equal(result, undefined)
    assert.deepEqual(errors, ['[FlashCat RUM][Error] Session Sample Rate should be a number between 0 and 100'])
  } finally {
    console.error = originalError
  }
})

test('validateAndBuildConfiguration uses default flushInterval', () => {
  const result = validateAndBuildConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
  })

  assert.ok(result)
  assert.equal(result.flushInterval, 15000)
})

test('validateAndBuildConfiguration uses custom flushInterval', () => {
  const result = validateAndBuildConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
    flushInterval: 5000,
  })

  assert.ok(result)
  assert.equal(result.flushInterval, 5000)
})

test('validateAndBuildConfiguration passes through optional fields', () => {
  const beforeSend = () => true
  const result = validateAndBuildConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
    service: 'my-service',
    env: 'production',
    version: '1.0.0',
    beforeSend,
  })

  assert.ok(result)
  assert.equal(result.service, 'my-service')
  assert.equal(result.env, 'production')
  assert.equal(result.version, '1.0.0')
  assert.equal(result.beforeSend, beforeSend)
})

test('validateAndBuildConfiguration debug defaults to false', () => {
  const result = validateAndBuildConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
  })

  assert.ok(result)
  assert.equal(result.debug, false)
})

test('validateAndBuildConfiguration creates endpointBuilder', () => {
  const result = validateAndBuildConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
  })

  assert.ok(result)
  assert.ok(result.endpointBuilder)
  assert.ok(result.endpointBuilder.urlPrefix)
})
