import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

export interface EventCounts {
  actionCount: number
  errorCount: number
  requestCount: number
}

export class EventCountsTracker {
  private counts: EventCounts = {
    actionCount: 0,
    errorCount: 0,
    requestCount: 0,
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
            this.counts.requestCount += 1
            break
        }
      }
    )
  }

  /**
   * 获取当前计数的快照（不重置）
   */
  getCounts(): EventCounts {
    return { ...this.counts }
  }

  /**
   * 重置计数（页面切换时调用）
   */
  reset() {
    this.counts = {
      actionCount: 0,
      errorCount: 0,
      requestCount: 0,
    }
  }

  /**
   * 停止追踪并取消订阅
   */
  stop() {
    this.subscription.unsubscribe()
  }
}
