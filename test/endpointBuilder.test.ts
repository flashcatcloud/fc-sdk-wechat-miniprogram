import test from 'node:test'
import assert from 'node:assert/strict'
import { createEndpointBuilder, isIntakeUrl } from '../packages/core/src/domain/configuration/endpointBuilder'

const TRACK_TYPE = 'rum'

test('createEndpointBuilder: direct mode uses default site browser.flashcat.cloud', () => {
  const initConfig = { clientToken: 'test-token' }
  const builder = createEndpointBuilder(initConfig, TRACK_TYPE, [])

  assert.equal(builder.trackType, 'rum')
  assert.match(builder.urlPrefix, /^https:\/\/browser\.flashcat\.cloud\/api\/v2\/rum/)
})

test('createEndpointBuilder: direct mode with custom site', () => {
  const initConfig = { clientToken: 'test-token', site: 'custom.example.com' }
  const builder = createEndpointBuilder(initConfig, TRACK_TYPE, [])

  assert.match(builder.urlPrefix, /^https:\/\/custom\.example\.com\/api\/v2\/rum/)
})

test('createEndpointBuilder: proxy string mode creates URL with ddforward', () => {
  const initConfig = {
    clientToken: 'test-token',
    proxy: 'https://proxy.example.com/path',
  }
  const builder = createEndpointBuilder(initConfig, TRACK_TYPE, [])

  assert.match(builder.urlPrefix, /^https:\/\/proxy\.example\.com\/path\?ddforward=/)
  const url = builder.build({})
  assert.ok(url.includes('ddforward='))
  // The ddforward value should contain the encoded path
  assert.ok(url.includes(encodeURIComponent('/api/v2/rum')))
})

test('isIntakeUrl returns true for URLs containing all required intake params', () => {
  const url = 'https://browser.flashcat.cloud/api/v2/rum?ddsource=miniapp&ddtags=sdk_version%3A0.1.0'
  assert.equal(isIntakeUrl(url), true)
})

test('isIntakeUrl returns false for URLs missing intake params', () => {
  const url = 'https://browser.flashcat.cloud/api/v2/rum?foo=bar'
  assert.equal(isIntakeUrl(url), false)
})

test('isIntakeUrl returns false for URL with only ddsource', () => {
  const url = 'https://browser.flashcat.cloud/api/v2/rum?ddsource=miniapp'
  assert.equal(isIntakeUrl(url), false)
})

test('isIntakeUrl returns false for URL with only ddtags', () => {
  const url = 'https://browser.flashcat.cloud/api/v2/rum?ddtags=some-tag'
  assert.equal(isIntakeUrl(url), false)
})
