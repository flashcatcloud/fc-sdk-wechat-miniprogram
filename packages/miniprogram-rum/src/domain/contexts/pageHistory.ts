import type { PageStateServerEntry, RawRumViewEvent } from '../../rawRumEvent.types'

export interface PageHistoryEntry {
  id: string
  name: string
  startTime: number
  loadTime?: number
  showTime?: number
  referrer?: string
  loadingType?: 'initial_load' | 'route_change'
  documentVersion: number
  updateIntervalId?: ReturnType<typeof setInterval>
  pageStates?: PageStateServerEntry[]
  metrics?: Partial<RawRumViewEvent['view']>
}
