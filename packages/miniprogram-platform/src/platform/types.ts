export interface RequestOptions {
  url: string
  method?: string
  data?: unknown
  header?: Record<string, string>
  timeout?: number
  success?: (res: { statusCode: number; data?: unknown }) => void
  fail?: (error: { errMsg: string }) => void
  complete?: () => void
}

export interface RequestTask {
  abort: () => void
}

export interface UploadFileOptions {
  url: string
  filePath: string
  name: string
  header?: Record<string, string>
  formData?: Record<string, unknown>
  timeout?: number
  success?: (res: { statusCode: number; data: string }) => void
  fail?: (error: { errMsg: string }) => void
  complete?: () => void
}

export interface UploadTask {
  abort: () => void
  onProgressUpdate?: (
    callback: (res: { progress: number; totalBytesSent: number; totalBytesExpectedToSend: number }) => void,
  ) => void
}

export interface DownloadFileOptions {
  url: string
  header?: Record<string, string>
  timeout?: number
  filePath?: string
  success?: (res: { statusCode: number; tempFilePath: string }) => void
  fail?: (error: { errMsg: string }) => void
  complete?: () => void
}

export interface DownloadTask {
  abort: () => void
  onProgressUpdate?: (
    callback: (res: { progress: number; totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
  ) => void
}

export interface StorageOptions {
  key: string
  data?: unknown
}

export interface NetworkTypeResult {
  networkType: string
}

export interface NetworkStatusChangeResult {
  isConnected: boolean
  networkType: string
}

export interface PageNotFoundResult {
  path: string
  query?: Record<string, string>
  isEntryPage?: boolean
}

export interface LazyLoadErrorResult {
  type: string
  subpackage?: Array<{ name?: string; root?: string; pages?: string[] }>
  errMsg?: string
}

export interface PlatformAdapter {
  request: (options: RequestOptions) => RequestTask
  uploadFile: (options: UploadFileOptions) => UploadTask
  downloadFile: (options: DownloadFileOptions) => DownloadTask
  patchRequest?: (request: (options: RequestOptions) => RequestTask) => () => void
  patchUploadFile?: (uploadFile: (options: UploadFileOptions) => UploadTask) => () => void
  patchDownloadFile?: (downloadFile: (options: DownloadFileOptions) => DownloadTask) => () => void
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
  onPageNotFound: (callback: (res: PageNotFoundResult) => void) => void
  onLazyLoadError: (callback: (res: LazyLoadErrorResult) => void) => void
}
