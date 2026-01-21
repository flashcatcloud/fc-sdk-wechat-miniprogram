import type { PlatformAdapter, RequestOptions, RequestTask } from '../types'

declare const wx: {
  request: (options: RequestOptions) => RequestTask
  setStorageSync: (key: string, data: unknown) => void
  getStorageSync: (key: string) => unknown
  removeStorageSync: (key: string) => void
  getSystemInfoSync: () => { model?: string; system?: string; version?: string; platform?: string }
  onAppShow: (callback: () => void) => void
  onAppHide: (callback: () => void) => void
  onError: (callback: (error: string) => void) => void
  onUnhandledRejection: (callback: (res: { reason: string }) => void) => void
}

export const wechatAdapter: PlatformAdapter = {
  request: (options) => wx.request(options),
  setStorageSync: (key, data) => wx.setStorageSync(key, data),
  getStorageSync: (key) => wx.getStorageSync(key),
  removeStorageSync: (key) => wx.removeStorageSync(key),
  getSystemInfoSync: () => wx.getSystemInfoSync(),
  onAppShow: (callback) => wx.onAppShow(callback),
  onAppHide: (callback) => wx.onAppHide(callback),
  onError: (callback) => wx.onError(callback),
  onUnhandledRejection: (callback) => wx.onUnhandledRejection(callback),
}
