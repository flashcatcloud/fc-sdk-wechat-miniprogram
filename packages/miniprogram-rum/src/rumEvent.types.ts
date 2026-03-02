import type { RawRumEvent } from './rawRumEvent.types'

export type NetworkInterface = 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown'

export interface Connectivity {
  status: 'connected' | 'not_connected'
  interfaces?: NetworkInterface[]
  effective_type?: string
}

export type RumEvent = RawRumEvent & {
  _dd?: {
    document_version: number
    format_version?: number
  }
  application: {
    id: string
  }
  session: {
    id: string
    type: string
    has_replay: boolean
    sampled_for_replay: boolean
  }
  user?: {
    id?: string
    name?: string
    email?: string
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
