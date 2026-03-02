import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

export interface EventCounts {
  actionCount: number
  errorCount: number
  resourceCount: number
}

export class EventCountsTracker {
  private counts: EventCounts = {
    actionCount: 0,
    errorCount: 0,
    resourceCount: 0,
  }

  private subscription: { unsubscribe: () => void }

  constructor(lifeCycle: LifeCycle) {
    this.subscription = lifeCycle.subscribe(
      LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
      (event) => {
        switch (event.type) {
          case 'action':
            this.counts.actionCount += 1
            break
          case 'error':
            this.counts.errorCount += 1
            break
          case 'request':
            this.counts.resourceCount += 1
            break
        }
      }
    )
  }

  getCounts(): EventCounts {
    return { ...this.counts }
  }

  reset() {
    this.counts = {
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
