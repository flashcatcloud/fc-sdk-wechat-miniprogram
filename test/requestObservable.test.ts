import test from 'node:test'
import assert from 'node:assert/strict'
import { initRequestObservable } from '../packages/miniprogram-platform/src/browser/requestObservable'
import { createHttpRequest } from '../packages/miniprogram-platform/src/transport/httpRequest'
import type { PlatformAdapter, RequestOptions, UploadFileOptions, DownloadFileOptions } from '../packages/miniprogram-platform/src/platform/types'

function createAdapter(): PlatformAdapter {
  return {
    request: (options: RequestOptions) => {
      return (globalThis as any).wx.request(options)
    },
    uploadFile: (options: UploadFileOptions) => {
      return (globalThis as any).wx.uploadFile(options)
    },
    downloadFile: (options: DownloadFileOptions) => {
      return (globalThis as any).wx.downloadFile(options)
    },
    setStorageSync: () => undefined,
    getStorageSync: () => undefined,
    removeStorageSync: () => undefined,
    getSystemInfoSync: () => ({}),
    getNetworkType: ({ success }: { success: (res: any) => void }) => success({ networkType: 'wifi' }),
    onNetworkStatusChange: () => undefined,
    onAppShow: () => undefined,
    onAppHide: () => undefined,
    onError: () => undefined,
    onUnhandledRejection: () => undefined,
  }
}

function mockWx() {
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
}

test('requestObservable ignores intake requests', () => {
  const originalWx = (globalThis as any).wx
  mockWx()

  try {
    const adapter = createAdapter()
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    adapter.request({
      url: 'https://browser.flashcat.cloud/api/v2/rum?ddsource=miniapp&ddtags=sdk_version%3A0.1.0%2Capi%3Aminiapp&dd-api-key=token&dd-evp-origin=miniapp',
    })
    adapter.request({ url: 'https://api.example.com/data' })

    stop()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].url, 'https://api.example.com/data')
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})

test('requestObservable ignores intake requests with browser-sdk-compatible parameters', () => {
  const originalWx = (globalThis as any).wx
  mockWx()

  try {
    const adapter = createAdapter()
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    adapter.request({
      url: 'https://proxy.example.com/rum?ddforward=%2Fapi%2Fv2%2Frum%3Fddsource%3Dminiapp%26ddtags%3Dsdk_version%253A0.1.0%252Capi%253Aminiapp',
    })
    adapter.request({ url: 'https://api.example.com/data' })

    stop()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].url, 'https://api.example.com/data')
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})

test('requestObservable ignores SDK intake requests even when proxy hides intake parameters', () => {
  const originalWx = (globalThis as any).wx
  mockWx()

  try {
    const adapter = createAdapter()
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    const request = createHttpRequest(
      adapter,
      {
        trackType: 'rum',
        build: () => 'https://proxy.example.com/hidden-rum-intake',
        urlPrefix: 'https://proxy.example.com/hidden-rum-intake',
        tags: [],
      },
      false,
    )

    request.send({ data: '{}', bytesCount: 2 })
    adapter.request({ url: 'https://api.example.com/data' })

    stop()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].url, 'https://api.example.com/data')
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})

test('requestObservable collects adapter requests once when adapter delegates to wx.request', () => {
  const originalWx = (globalThis as any).wx
  mockWx()

  try {
    const adapter = createAdapter()
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    adapter.request({ url: 'https://api.example.com/data' })

    stop()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].url, 'https://api.example.com/data')
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})

test('requestObservable tracks uploadFile requests with requestType=upload', () => {
  const originalWx = (globalThis as any).wx
  mockWx()

  try {
    const adapter = createAdapter()
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    adapter.uploadFile({ url: 'https://api.example.com/upload', filePath: '/tmp/test.jpg', name: 'file' })

    stop()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].url, 'https://api.example.com/upload')
    assert.equal(completed[0].requestType, 'upload')
    assert.equal(completed[0].statusCode, 200)
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})

test('requestObservable tracks downloadFile requests with requestType=download', () => {
  const originalWx = (globalThis as any).wx
  mockWx()

  try {
    const adapter = createAdapter()
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    adapter.downloadFile({ url: 'https://api.example.com/file.zip' })

    stop()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].url, 'https://api.example.com/file.zip')
    assert.equal(completed[0].requestType, 'download')
    assert.equal(completed[0].statusCode, 200)
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})

test('requestObservable ignores intake uploadFile requests', () => {
  const originalWx = (globalThis as any).wx
  mockWx()

  try {
    const adapter = createAdapter()
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    adapter.uploadFile({
      url: 'https://browser.flashcat.cloud/api/v2/rum?ddsource=miniapp&ddtags=sdk_version%3A0.1.0',
      filePath: '/tmp/intake.jpg',
      name: 'file',
    })
    adapter.uploadFile({ url: 'https://api.example.com/upload', filePath: '/tmp/test.jpg', name: 'file' })

    stop()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].url, 'https://api.example.com/upload')
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})

test('requestObservable ignores intake downloadFile requests', () => {
  const originalWx = (globalThis as any).wx
  mockWx()

  try {
    const adapter = createAdapter()
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    adapter.downloadFile({
      url: 'https://browser.flashcat.cloud/api/v2/rum?ddsource=miniapp&ddtags=sdk_version%3A0.1.0',
    })
    adapter.downloadFile({ url: 'https://api.example.com/file.zip' })

    stop()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].url, 'https://api.example.com/file.zip')
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})

test('requestObservable sets requestType=xhr for regular requests', () => {
  const originalWx = (globalThis as any).wx
  mockWx()

  try {
    const adapter = createAdapter()
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    adapter.request({ url: 'https://api.example.com/data' })

    stop()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].requestType, 'xhr')
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})
