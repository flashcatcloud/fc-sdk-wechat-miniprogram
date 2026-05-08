import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RawRumEvent } from '../../rawRumEvent.types'
import type { PageHistoryEntry } from './pageHistory'

export interface EventCounts {
  actionCount: number
  errorCount: number
  resourceCount: number
}

export class EventCountsTracker {
  private countsByPageId = new Map<string, EventCounts>()

  private subscription: { unsubscribe: () => void }

  constructor(
    lifeCycle: LifeCycle,
    private findPage: (event: RawRumEvent) => PageHistoryEntry | undefined,
    private onCountChanged?: (page: PageHistoryEntry) => void,
  ) {
    this.subscription = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => {
      if (event.type === 'view') {
        return
      }
      const page = this.findPage(event)
      if (!page) {
        return
      }
      const counts = this.getOrCreateCounts(page.id)
      let changed = false
      switch (event.type) {
        case 'action':
          counts.actionCount += 1
          changed = true
          break
        case 'error':
          counts.errorCount += 1
          changed = true
          break
        case 'resource':
          counts.resourceCount += 1
          changed = true
          break
      }
      if (changed) {
        this.onCountChanged?.(page)
      }
    })
  }

  getCounts(pageId?: string): EventCounts {
    if (!pageId) {
      return this.createEmptyCounts()
    }
    return { ...this.getOrCreateCounts(pageId) }
  }

  private getOrCreateCounts(pageId: string): EventCounts {
    let counts = this.countsByPageId.get(pageId)
    if (!counts) {
      counts = this.createEmptyCounts()
      this.countsByPageId.set(pageId, counts)
    }
    return counts
  }

  private createEmptyCounts(): EventCounts {
    return {
      actionCount: 0,
      errorCount: 0,
      resourceCount: 0,
    }
  }

  /**
   * 停止追踪并取消订阅
   */
  stop() {
    this.subscription.unsubscribe()
  }
}
