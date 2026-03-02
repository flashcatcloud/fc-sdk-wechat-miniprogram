import type { PageStateServerEntry } from '../../rawRumEvent.types'
import { generateUUID } from '@flashcatcloud/miniprogram-core'

export interface PageHistoryEntry {
  id: string
  name: string
  startTime: number
  loadTime?: number
  referrer?: string
  loadingType?: 'initial_load' | 'route_change'
  documentVersion: number
  updateIntervalId?: ReturnType<typeof setInterval>
  pageStates?: PageStateServerEntry[]
}

export function createPageHistory() {
  let current: PageHistoryEntry | undefined

  function startPage(name: string, time: number) {
    current = {
      id: generateUUID(),
      name,
      startTime: time,
      documentVersion: 0,
    }
    return current
  }

  function getCurrent() {
    return current
  }

  function stopPage(time: number) {
    if (!current) {
      return undefined
    }
    const ended = { ...current }
    current = undefined
    return { ...ended, endTime: time }
  }

  return {
    startPage,
    getCurrent,
    stopPage,
  }
}
