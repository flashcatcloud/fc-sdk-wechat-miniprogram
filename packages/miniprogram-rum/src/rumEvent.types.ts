import type { RawRumEvent } from './rawRumEvent.types'

export type RumEvent = RawRumEvent & {
  application: {
    id: string
  }
  session: {
    id: string
  }
  user?: {
    id?: string
    name?: string
    email?: string
  }
  view: {
    id: string
    name: string
  }
  context?: Record<string, unknown>
}
