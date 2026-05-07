import type {
  DownloadFileOptions,
  DownloadTask,
  NetworkStatusChangeResult,
  NetworkTypeResult,
  PlatformAdapter,
  RequestOptions,
  RequestTask,
  UploadFileOptions,
  UploadTask,
} from '../types'

declare const wx: {
  request: (options: RequestOptions) => RequestTask
  uploadFile: (options: UploadFileOptions) => UploadTask
  downloadFile: (options: DownloadFileOptions) => DownloadTask
  setStorageSync: (key: string, data: unknown) => void
  getStorageSync: (key: string) => unknown
  removeStorageSync: (key: string) => void
  getSystemInfoSync: () => {
    model?: string
    system?: string
    version?: string
    platform?: string
  }
  getNetworkType: (options: { success: (res: NetworkTypeResult) => void }) => void
  onNetworkStatusChange: (callback: (res: NetworkStatusChangeResult) => void) => void
  onAppShow: (callback: () => void) => void
  onAppHide: (callback: () => void) => void
  onError: (callback: (error: string) => void) => void
  onUnhandledRejection: (callback: (res: { reason: string }) => void) => void
}

let requestDelegate: ((options: RequestOptions) => RequestTask) | undefined
let uploadFileDelegate: ((options: UploadFileOptions) => UploadTask) | undefined
let downloadFileDelegate: ((options: DownloadFileOptions) => DownloadTask) | undefined

export const wechatAdapter: PlatformAdapter = {
  request: (options) => (requestDelegate || wx.request)(options),
  uploadFile: (options) => (uploadFileDelegate || wx.uploadFile)(options),
  downloadFile: (options) => (downloadFileDelegate || wx.downloadFile)(options),
  patchRequest: (request) => {
    const originalRequest = wx.request
    requestDelegate = originalRequest
    wx.request = request
    return () => {
      wx.request = originalRequest
      requestDelegate = undefined
    }
  },
  patchUploadFile: (uploadFile) => {
    const originalUploadFile = wx.uploadFile
    uploadFileDelegate = originalUploadFile
    wx.uploadFile = uploadFile
    return () => {
      wx.uploadFile = originalUploadFile
      uploadFileDelegate = undefined
    }
  },
  patchDownloadFile: (downloadFile) => {
    const originalDownloadFile = wx.downloadFile
    downloadFileDelegate = originalDownloadFile
    wx.downloadFile = downloadFile
    return () => {
      wx.downloadFile = originalDownloadFile
      downloadFileDelegate = undefined
    }
  },
  setStorageSync: (key, data) => wx.setStorageSync(key, data),
  getStorageSync: (key) => wx.getStorageSync(key),
  removeStorageSync: (key) => wx.removeStorageSync(key),
  getSystemInfoSync: () => wx.getSystemInfoSync(),
  getNetworkType: (options) => wx.getNetworkType(options),
  onNetworkStatusChange: (callback) => wx.onNetworkStatusChange(callback),
  onAppShow: (callback) => wx.onAppShow(callback),
  onAppHide: (callback) => wx.onAppHide(callback),
  onError: (callback) => wx.onError(callback),
  onUnhandledRejection: (callback) => wx.onUnhandledRejection(callback),
}
