import test from 'node:test'
import assert from 'node:assert/strict'
import { PageContextManager } from '../packages/miniprogram-rum/src/domain/contexts/pageContextManager'

function mockGetCurrentPages(routes: string[]) {
  ;(globalThis as any).getCurrentPages = () => routes.map((route) => ({ route }))
}

test('getLoadingType returns initial_load for the first page', () => {
  mockGetCurrentPages(['/pages/index/index'])
  const manager = new PageContextManager()
  assert.equal(manager.getLoadingType(), 'initial_load')
})

test('getLoadingType returns route_change after first page load', () => {
  mockGetCurrentPages(['/pages/index/index'])
  const manager = new PageContextManager()
  manager.getLoadingType() // consume initial_load
  mockGetCurrentPages(['/pages/index/index', '/pages/detail/detail'])
  assert.equal(manager.getLoadingType(), 'route_change')
})

test('getReferrer returns previous page route', () => {
  mockGetCurrentPages(['/pages/index/index', '/pages/detail/detail'])
  const manager = new PageContextManager()
  assert.equal(manager.getReferrer(), '/pages/index/index')
})

test('getReferrer returns undefined when only one page in stack', () => {
  mockGetCurrentPages(['/pages/index/index'])
  const manager = new PageContextManager()
  assert.equal(manager.getReferrer(), undefined)
})

test('resetIfNeeded resets to initial_load state when page stack collapses after first page', () => {
  mockGetCurrentPages(['/pages/index/index'])
  const manager = new PageContextManager()
  manager.getLoadingType() // sets isFirstPageLoad = false

  // Simulate wx.reLaunch: page stack is cleared back to one page
  mockGetCurrentPages(['/pages/home/home'])
  manager.resetIfNeeded()

  // After reset, next getLoadingType should return initial_load again
  assert.equal(manager.getLoadingType(), 'initial_load')
})

test('resetIfNeeded does not reset when called before any page has loaded', () => {
  mockGetCurrentPages(['/pages/index/index'])
  const manager = new PageContextManager()

  // isFirstPageLoad is still true, so resetIfNeeded should be a no-op
  manager.resetIfNeeded()
  assert.equal(manager.getLoadingType(), 'initial_load')
})

test('resetIfNeeded does not reset when page stack has multiple pages', () => {
  mockGetCurrentPages(['/pages/index/index'])
  const manager = new PageContextManager()
  manager.getLoadingType() // sets isFirstPageLoad = false

  // Stack still has multiple pages, so no reset
  mockGetCurrentPages(['/pages/index/index', '/pages/detail/detail'])
  manager.resetIfNeeded()
  assert.equal(manager.getLoadingType(), 'route_change')
})
