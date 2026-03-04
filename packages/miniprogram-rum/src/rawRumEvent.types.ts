export type RumEventType = 'view' | 'request' | 'error' | 'action' | 'custom'

export interface RawRumEventBase {
  date: number
  type: RumEventType
}

export interface PageStateServerEntry {
  state: string
  start: number
}

export interface RawRumViewEvent extends RawRumEventBase {
  type: 'view'
  _dd: {
    document_version: number
    format_version: number
    page_states?: PageStateServerEntry[]
    configuration: {
      session_sample_rate: number
      session_replay_sample_rate: number
      start_session_replay_recording_manually: boolean
    }
  }
  view: {
    id: string
    url: string
    name: string
    referrer?: string
    loading_type?: 'initial_load' | 'route_change'
    loading_time?: number
    time_spent?: number
    is_active?: boolean
    action?: { count: number }
    error?: { count: number }
    resource?: { count: number }
  }
}

export interface RawRumRequestEvent extends RawRumEventBase {
  type: 'request'
  request: {
    id: string
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
  _dd?: {
    action?: {
      position?: {
        x: number
        y: number
      }
    }
  }
  action: {
    id: string
    type: string
    target: {
      name: string
    }
    loading_time?: number
    error?: { count: number }
    long_task?: { count: number }
    resource?: { count: number }
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
