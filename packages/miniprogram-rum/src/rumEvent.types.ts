import type { RawRumEvent } from './rawRumEvent.types'

export type NetworkInterface = 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown'

export interface Connectivity {
  status: 'connected' | 'not_connected'
  interfaces?: NetworkInterface[]
  effective_type?: string
}

export type RumEvent = RawRumEvent & {
  service?: string
  version?: string
  application: {
    id: string
  }
  session: {
    id: string
    type: string
    has_replay: boolean
    sampled_for_replay: boolean
    /** Set on view events of a session kept only because it reported an error. */
    sampled_for_error?: boolean
  }
  usr?: {
    id?: string
    name?: string
    email?: string
    anonymous_id?: string
  }
  view: {
    id: string
    url: string
    name: string
  }
  connectivity?: Connectivity
  context?: Record<string, unknown>
  source: string
}
