export type RumEventType = 'view' | 'resource' | 'error' | 'action' | 'custom'

export type ResourceType = 'xhr' | 'upload' | 'download'

export interface RawRumEventBase {
  date: number
  type: RumEventType
}

export interface PageStateServerEntry {
  state: string
  start: number
}

export interface ViewPerformanceData {
  fcp?: {
    timestamp: number
  }
  lcp?: {
    timestamp: number
  }
}

export interface ViewSetDataMetrics {
  count: number
  duration?: number
}

export interface ViewFirstRenderDetail {
  view_layer_ready_time?: number
  init_data_send_time?: number
  init_data_recv_time?: number
  view_layer_render_start_time?: number
  view_layer_render_end_time?: number
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
    onload_to_onshow?: number
    onshow_to_onready?: number
    first_render?: number
    first_render_detail?: ViewFirstRenderDetail
    app_launch?: number
    evaluate_script?: number
    setdata?: ViewSetDataMetrics
    performance?: ViewPerformanceData
    custom_timings?: Record<string, number>
    action?: { count: number }
    error?: { count: number }
    resource?: { count: number }
  }
}

export interface RawRumResourceEvent extends RawRumEventBase {
  type: 'resource'
  resource: {
    id: string
    type: ResourceType
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
  | RawRumResourceEvent
  | RawRumErrorEvent
  | RawRumActionEvent
  | RawRumCustomEvent
