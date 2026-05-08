import test from 'node:test'
import assert from 'node:assert/strict'
import { initRequestObservable } from '../packages/miniprogram-platform/src/browser/requestObservable'
import { createHttpRequest } from '../packages/miniprogram-platform/src/transport/httpRequest'
import type { PlatformAdapter, RequestOptions, UploadFileOptions, DownloadFileOptions } from '../packages/miniprogram-platform/src/platform/types'

function createAdapter(): PlatformAdapter {
  let requestDelegate = (options: RequestOptions) => (globalThis as any).wx.request(options)
  let uploadFileDelegate = (options: UploadFileOptions) => (globalThis as any).wx.uploadFile(options)
  let downloadFileDelegate = (options: DownloadFileOptions) => (globalThis as any).wx.downloadFile(options)

  return {
    request: (options: RequestOptions) => {
      return requestDelegate(options)
    },
    uploadFile: (options: UploadFileOptions) => {
      return uploadFileDelegate(options)
    },
    downloadFile: (options: DownloadFileOptions) => {
      return downloadFileDelegate(options)
    },
    patchRequest: (request) => {
      const originalRequest = (globalThis as any).wx.request
      requestDelegate = originalRequest
      ;(globalThis as any).wx.request = request
      return () => {
        ;(globalThis as any).wx.request = originalRequest
        requestDelegate = (options: RequestOptions) => (globalThis as any).wx.request(options)
      }
    },
    patchUploadFile: (uploadFile) => {
      const originalUploadFile = (globalThis as any).wx.uploadFile
      uploadFileDelegate = originalUploadFile
      ;(globalThis as any).wx.uploadFile = uploadFile
      return () => {
        ;(globalThis as any).wx.uploadFile = originalUploadFile
        uploadFileDelegate = (options: UploadFileOptions) => (globalThis as any).wx.uploadFile(options)
      }
    },
    patchDownloadFile: (downloadFile) => {
      const originalDownloadFile = (globalThis as any).wx.downloadFile
      downloadFileDelegate = originalDownloadFile
      ;(globalThis as any).wx.downloadFile = downloadFile
      return () => {
        ;(globalThis as any).wx.downloadFile = originalDownloadFile
        downloadFileDelegate = (options: DownloadFileOptions) => (globalThis as any).wx.downloadFile(options)
      }
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

function createStandaloneAdapter(): PlatformAdapter {
  return {
    request: (options: RequestOptions) => {
      options.success?.({ statusCode: 201, data: 'ok' })
      options.complete?.()
      return { abort: () => undefined }
    },
    uploadFile: (options: UploadFileOptions) => {
      options.success?.({ statusCode: 201, data: 'ok' })
      options.complete?.()
      return { abort: () => undefined }
    },
    downloadFile: (options: DownloadFileOptions) => {
      options.success?.({ statusCode: 201, tempFilePath: '/tmp/file' })
      options.complete?.()
      return { abort: () => undefined }
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

test('requestObservable can collect adapter requests without global wx', () => {
  const originalWx = (globalThis as any).wx
  delete (globalThis as any).wx

  try {
    const adapter = createStandaloneAdapter()
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    adapter.request({ url: 'https://api.example.com/data' })

    stop()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].url, 'https://api.example.com/data')
    assert.equal(completed[0].statusCode, 201)
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})

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

test('requestObservable tracks direct wx.request calls', () => {
  const originalWx = (globalThis as any).wx
  mockWx()

  try {
    const adapter = createAdapter()
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    ;(globalThis as any).wx.request({ url: 'https://api.example.com/direct' })

    stop()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].url, 'https://api.example.com/direct')
    assert.equal(completed[0].requestType, 'xhr')
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})

test('requestObservable tracks direct wx.uploadFile calls', () => {
  const originalWx = (globalThis as any).wx
  mockWx()

  try {
    const adapter = createAdapter()
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    ;(globalThis as any).wx.uploadFile({
      url: 'https://api.example.com/direct-upload',
      filePath: '/tmp/test.jpg',
      name: 'file',
    })

    stop()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].url, 'https://api.example.com/direct-upload')
    assert.equal(completed[0].requestType, 'upload')
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})

test('requestObservable tracks direct wx.downloadFile calls', () => {
  const originalWx = (globalThis as any).wx
  mockWx()

  try {
    const adapter = createAdapter()
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    ;(globalThis as any).wx.downloadFile({ url: 'https://api.example.com/direct-file.zip' })

    stop()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].url, 'https://api.example.com/direct-file.zip')
    assert.equal(completed[0].requestType, 'download')
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})

test('requestObservable stop restores original wx.request', () => {
  const originalWx = (globalThis as any).wx
  mockWx()

  try {
    const adapter = createAdapter()
    const originalRequest = (globalThis as any).wx.request
    const { observable, stop } = initRequestObservable(adapter)
    const completed: any[] = []
    observable.subscribe((event) => completed.push(event))

    stop()
    assert.equal((globalThis as any).wx.request, originalRequest)

    ;(globalThis as any).wx.request({ url: 'https://api.example.com/after-stop' })
    assert.equal(completed.length, 0)
  } finally {
    ;(globalThis as any).wx = originalWx
  }
})
