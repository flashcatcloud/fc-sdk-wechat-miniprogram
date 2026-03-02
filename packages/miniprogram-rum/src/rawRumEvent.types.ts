export type RumEventType = 'view' | 'request' | 'error' | 'action' | 'custom'

export interface RawRumEventBase {
  date: number
  type: RumEventType
}

export interface RawRumViewEvent extends RawRumEventBase {
  type: 'view'
  _dd: {
    document_version: number
  }
  view: {
    id: string
    name: string
    referrer?: string
    loading_type?: 'initial_load' | 'route_change'
    loading_time?: number
    time_spent?: number
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
    status_code?: number
    duration: number
    error_message?: string
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
  | RawRumCustomEvent
