export type RumEventType = 'page' | 'request' | 'error' | 'action' | 'performance' | 'custom'

export interface RawRumEventBase {
  date: number
  type: RumEventType
}

export interface RawRumPageEvent extends RawRumEventBase {
  type: 'page'
  page: {
    id: string
    name: string
    loading_time?: number      // 页面加载时间（onReady - onLoad）
    time_spent?: number        // 页面停留时间（当前时间 - startTime）
    document_version?: number  // 追踪页面更新次数，每次更新递增
    is_active?: boolean        // 标识页面是否仍处于活跃状态
  }
}

export interface RawRumRequestEvent extends RawRumEventBase {
  type: 'request'
  request: {
    url: string
    method: string
    status_code?: number       // HTTP 状态码
    duration: number
    error_message?: string     // 错误信息
  }
}

export interface RawRumErrorEvent extends RawRumEventBase {
  type: 'error'
  error: {
    message: string
    stack?: string
    source: 'app' | 'promise' | 'custom'
  }
}

export interface RawRumActionEvent extends RawRumEventBase {
  type: 'action'
  action: {
    name: string
    type: string
  }
}

export interface RawRumPerformanceEvent extends RawRumEventBase {
  type: 'performance'
  performance: {
    name: string
    value: number
  }
}

export interface RawRumCustomEvent extends RawRumEventBase {
  type: 'custom'
  event: {
    name: string
    context?: Record<string, unknown>
  }
}

export type RawRumEvent =
  | RawRumPageEvent
  | RawRumRequestEvent
  | RawRumErrorEvent
  | RawRumActionEvent
  | RawRumPerformanceEvent
  | RawRumCustomEvent
