import test from 'node:test'
import assert from 'node:assert/strict'
import { startRum } from '../packages/miniprogram-rum/src/boot/startRum'
import { validateAndBuildRumConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'
import { LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import type { PlatformAdapter } from '../packages/miniprogram-platform/src/platform/types'

test('a page loaded while no session exists starts exactly one session, even when the clock moves', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 })
  const globals = ['wx', 'Page', 'getCurrentPages'] as const
  const saved = globals.map((name) => Object.getOwnPropertyDescriptor(globalThis, name))
  ;(globalThis as any).wx = { request: () => ({ abort: () => undefined }), getPerformance: () => undefined }
  ;(globalThis as any).Page = (options: Record<string, any>) => options
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/home' }]
  const storage = new Map<string, unknown>()
  const adapter = {
    request: () => ({ abort: () => undefined }),
    uploadFile: () => ({ abort: () => undefined }),
    downloadFile: () => ({ abort: () => undefined }),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    getStorageSync: (key: string) => storage.get(key),
    removeStorageSync: (key: string) => storage.delete(key),
    getSystemInfoSync: () => ({}),
    getNetworkType: ({ success }: { success: (res: any) => void }) => success({ networkType: 'wifi' }),
    onNetworkStatusChange: () => undefined,
    onAppShow: () => undefined,
    onAppHide: () => undefined,
    onError: () => undefined,
    onUnhandledRejection: () => undefined,
    onPageNotFound: () => undefined,
    onLazyLoadError: () => undefined,
  } as unknown as PlatformAdapter
  const started = startRum(
    validateAndBuildRumConfiguration({
      clientToken: 'token',
      applicationId: 'app',
      trackActions: false,
      trackPerformance: false,
      flushInterval: 100000,
    })!,
    adapter,
  )
  try {
    const renewed: string[] = []
    const collected: any[] = []
    started.lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, ({ session }) => renewed.push(session.id))
    started.lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => collected.push(event))
    const renew = started.sessionManager.renew
    // The page is created, then its own view renews the session a millisecond later.
    started.sessionManager.renew = () => {
      t.mock.timers.tick(1)
      return renew()
    }
    started.sessionManager.expire()
    t.mock.timers.tick(10)
    const page = (globalThis as any).Page({ onLoad() {}, onShow() {} })
    page.onLoad.call({ route: 'pages/home' }, {})
    started.addCustomEvent('after-load')

    assert.equal(renewed.length, 1, 'no second session is started for the finalized page')
    assert.equal(started.sessionManager.findSession()!.id, renewed[0])
    assert.deepEqual([...new Set(collected.map((event) => event.session.id))], [renewed[0]])
  } finally {
    started.stop()
    globals.forEach((name, index) => {
      const descriptor = saved[index]
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor)
      } else {
        delete (globalThis as any)[name]
      }
    })
  }
})
