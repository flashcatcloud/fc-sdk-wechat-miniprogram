import test from 'node:test'
import assert from 'node:assert/strict'
import { startRum } from '../packages/miniprogram-rum/src/boot/startRum'
import { validateAndBuildRumConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'
import { LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import type { PlatformAdapter, RequestOptions } from '../packages/miniprogram-core/src/platform/types'

function createAdapter(): PlatformAdapter {
  let storage: unknown
  return {
    request: (options: RequestOptions) => {
      options.success?.({ statusCode: 200, data: 'ok' })
      options.complete?.()
      return { abort: () => undefined }
    },
    setStorageSync: (_key, data) => {
      storage = data
    },
    getStorageSync: () => storage,
    removeStorageSync: () => {
      storage = undefined
    },
    getSystemInfoSync: () => ({}),
    getNetworkType: ({ success }) => success({ networkType: 'wifi' }),
    onNetworkStatusChange: () => undefined,
    onAppShow: () => undefined,
    onAppHide: () => undefined,
    onError: () => undefined,
    onUnhandledRejection: () => undefined,
  }
}

test('startRum does not emit view events when trackPages is false', () => {
  const originalWx = (globalThis as any).wx
  const originalPage = (globalThis as any).Page
  ;(globalThis as any).wx = {
    request: (options: RequestOptions) => {
      options.success?.({ statusCode: 200, data: 'ok' })
      options.complete?.()
      return { abort: () => undefined }
    },
    uploadFile: (options: any) => {
      options.success?.({ statusCode: 200, data: 'ok' })
      options.complete?.()
      return { abort: () => undefined }
    },
    downloadFile: (options: any) => {
      options.success?.({ statusCode: 200, tempFilePath: '/tmp/file' })
      options.complete?.()
      return { abort: () => undefined }
    },
    getPerformance: () => undefined,
  }
  ;(globalThis as any).Page = (options: Record<string, any>) => options

  try {
    const configuration = validateAndBuildRumConfiguration({
      clientToken: 'token',
      applicationId: 'app',
      trackPages: false,
      trackActions: false,
      trackPerformance: false,
      flushInterval: 100000,
    })!
    const started = startRum(configuration, createAdapter())
    const collected: any[] = []
    started.lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => collected.push(event))

    started.startPage('manual-page')

    started.stop()
    assert.equal(collected.some((event) => event.type === 'view'), false)
  } finally {
    ;(globalThis as any).wx = originalWx
    ;(globalThis as any).Page = originalPage
  }
})
