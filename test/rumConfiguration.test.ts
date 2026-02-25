import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAndBuildRumConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'

test('validateAndBuildRumConfiguration returns undefined without clientToken', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: '',
    applicationId: 'app-123',
  })
  assert.equal(result, undefined)
})

test('validateAndBuildRumConfiguration returns config with valid input', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
  })

  assert.ok(result)
  assert.equal(result.clientToken, 'token-123')
  assert.equal(result.applicationId, 'app-123')
})

test('validateAndBuildRumConfiguration defaults trackActions to true', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
  })

  assert.ok(result)
  assert.equal(result.trackActions, true)
})

test('validateAndBuildRumConfiguration defaults trackRequests to true', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
  })

  assert.ok(result)
  assert.equal(result.trackRequests, true)
})

test('validateAndBuildRumConfiguration defaults trackErrors to true', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
  })

  assert.ok(result)
  assert.equal(result.trackErrors, true)
})

test('validateAndBuildRumConfiguration defaults trackPerformance to true', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
  })

  assert.ok(result)
  assert.equal(result.trackPerformance, true)
})

test('validateAndBuildRumConfiguration defaults trackPages to true', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
  })

  assert.ok(result)
  assert.equal(result.trackPages, true)
})

test('validateAndBuildRumConfiguration allows disabling tracking', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
    trackActions: false,
    trackRequests: false,
    trackErrors: false,
  })

  assert.ok(result)
  assert.equal(result.trackActions, false)
  assert.equal(result.trackRequests, false)
  assert.equal(result.trackErrors, false)
})

test('validateAndBuildRumConfiguration defaults eventRateLimiterThreshold to 3000', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
  })

  assert.ok(result)
  assert.equal(result.eventRateLimiterThreshold, 3000)
})

test('validateAndBuildRumConfiguration uses custom eventRateLimiterThreshold', () => {
  const result = validateAndBuildRumConfiguration({
    clientToken: 'token-123',
    applicationId: 'app-123',
    eventRateLimiterThreshold: 5000,
  })

  assert.ok(result)
  assert.equal(result.eventRateLimiterThreshold, 5000)
})
