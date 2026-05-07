import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTags } from '../packages/core/src/domain/configuration/tags'

test('buildTags with all fields (env, service, version)', () => {
  const tags = buildTags({ env: 'production', service: 'my-service', version: '1.0.0' })

  assert.deepEqual(tags, ['env:production', 'service:my-service', 'version:1.0.0'])
})

test('buildTags with no fields returns empty array', () => {
  const tags = buildTags({})

  assert.deepEqual(tags, [])
})

test('buildTags sanitizes commas in values by replacing with underscores', () => {
  const tags = buildTags({ env: 'prod,us-east', service: 'api,gateway' })

  assert.deepEqual(tags, ['env:prod_us-east', 'service:api_gateway'])
})

test('buildTags with only env', () => {
  const tags = buildTags({ env: 'staging' })

  assert.deepEqual(tags, ['env:staging'])
})

test('buildTags with only service', () => {
  const tags = buildTags({ service: 'web-app' })

  assert.deepEqual(tags, ['service:web-app'])
})

test('buildTags with only version', () => {
  const tags = buildTags({ version: '2.3.4' })

  assert.deepEqual(tags, ['version:2.3.4'])
})
