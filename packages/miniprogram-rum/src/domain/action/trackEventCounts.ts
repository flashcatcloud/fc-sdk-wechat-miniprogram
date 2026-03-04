import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

export interface EventCounts {
  errorCount: number
  resourceCount: number
}

export function trackEventCounts(lifeCycle: LifeCycle): { counts: EventCounts; stop: () => void } {
  const counts: EventCounts = { errorCount: 0, resourceCount: 0 }
  const sub = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => {
    if (event.type === 'error') counts.errorCount++
    if (event.type === 'request') counts.resourceCount++
  })
  return { counts, stop: () => sub.unsubscribe() }
}
