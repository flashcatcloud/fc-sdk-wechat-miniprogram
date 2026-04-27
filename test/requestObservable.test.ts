import test from 'node:test'
import assert from 'node:assert/strict'
import { initRequestObservable } from '../packages/miniprogram-core/src/browser/requestObservable'
import type { PlatformAdapter, RequestOptions } from '../packages/miniprogram-core/src/platform/types'

function createAdapter(): PlatformAdapter {
  return {
    request: (options: RequestOptions) => {
      options.success?.({ statusCode: 200, data: 'ok' })
      options.complete?.()
      return { abort: () => undefined }
    },
    setStorageSync: () => undefined,
    getStorageSync: () => undefined,
    removeStorageSync: () => undefined,
    getSystemInfoSync: () => ({}),
    getNetworkType: ({ success }) => success({ networkType: 'wifi' }),
    onNetworkStatusChange: () => undefined,
    onAppShow: () => undefined,
    onAppHide: () => undefined,
    onError: () => undefined,
    onUnhandledRejection: () => undefined,
  }
}

test('requestObservable ignores intake requests', () => {
  const originalWx = (globalThis as any).wx
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
  }

  try {
    const adapter = createAdapter()
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    adapter.request({
      url: 'https://browser.flashcat.cloud/api/v2/rum?ddsource=miniapp&dd-api-key=token&dd-evp-origin=miniapp',
    })
    adapter.request({ url: 'https://api.example.com/data' })

    stop()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].url, 'https://api.example.com/data')
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})
