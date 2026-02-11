export interface RequestOptions {
  url: string;
  method?: string;
  data?: unknown;
  header?: Record<string, string>;
  timeout?: number;
  success?: (res: { statusCode: number; data?: unknown }) => void;
  fail?: (error: { errMsg: string }) => void;
  complete?: () => void;
}

export interface RequestTask {
  abort: () => void;
}

export interface StorageOptions {
  key: string;
  data?: unknown;
}

export interface PlatformAdapter {
  request: (options: RequestOptions) => RequestTask;
  setStorageSync: (key: string, data: unknown) => void;
  getStorageSync: (key: string) => unknown;
  removeStorageSync: (key: string) => void;
  getSystemInfoSync: () => {
    model?: string;
    system?: string;
    version?: string;
    platform?: string;
  };
  onAppShow: (callback: () => void) => void;
  onAppHide: (callback: () => void) => void;
  onError: (callback: (error: string) => void) => void;
  onUnhandledRejection: (callback: (res: { reason: string }) => void) => void;
}
