export type RumEventType = 'view' | 'request' | 'error' | 'action' | 'performance' | 'custom'

export interface RawRumEventBase {
  date: number
  type: RumEventType
}

export interface RawRumViewEvent extends RawRumEventBase {
  type: 'view'
  view: {
    id: string
    name: string
    referrer?: string
    loading_type?: 'initial_load' | 'route_change'
    loading_time?: number
    time_spent?: number
    document_version?: number
    is_active?: boolean
    action?: { count: number }
    error?: { count: number }
    request?: { count: number }
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
    fingerprint?: string
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
  | RawRumViewEvent
  | RawRumRequestEvent
  | RawRumErrorEvent
  | RawRumActionEvent
  | RawRumPerformanceEvent
  | RawRumCustomEvent
