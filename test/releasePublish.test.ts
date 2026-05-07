import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { getExpectedVersion, getNpmDistTag, buildPublishArgs } = require('../scripts/release/publish-options')

test('getExpectedVersion returns tag version for GitHub tag releases', () => {
  assert.equal(
    getExpectedVersion({
      GITHUB_REF_TYPE: 'tag',
      GITHUB_REF_NAME: 'v1.2.3',
    }),
    '1.2.3'
  )
})

test('getExpectedVersion ignores non-tag GitHub refs', () => {
  assert.equal(
    getExpectedVersion({
      GITHUB_REF_TYPE: 'branch',
      GITHUB_REF_NAME: 'main',
    }),
    undefined
  )
})

test('getNpmDistTag publishes stable versions as latest', () => {
  assert.equal(getNpmDistTag('1.2.3'), 'latest')
})

test('getNpmDistTag publishes prerelease versions as next', () => {
  assert.equal(getNpmDistTag('1.2.3-alpha.1'), 'next')
})

test('buildPublishArgs includes npm dist-tag', () => {
  assert.deepEqual(buildPublishArgs({ dryRun: true, distTag: 'next' }), [
    'publish',
    '--access',
    'public',
    '--registry',
    'https://registry.npmjs.org/',
    '--tag',
    'next',
    '--dry-run',
  ])
})
