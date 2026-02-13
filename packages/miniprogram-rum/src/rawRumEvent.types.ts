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
    loadingTime?: number
    timeSpent?: number
    documentVersion?: number  // 追踪页面更新次数，每次更新递增
    isActive?: boolean        // 标识页面是否仍处于活跃状态
  }
}

export interface RawRumRequestEvent extends RawRumEventBase {
  type: 'request'
  request: {
    url: string
    method: string
    statusCode?: number
    duration: number
    errorMessage?: string
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
