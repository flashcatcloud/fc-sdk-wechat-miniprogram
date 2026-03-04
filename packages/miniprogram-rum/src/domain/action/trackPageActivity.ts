import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

export const PAGE_ACTIVITY_VALIDATION_DELAY = 100
export const PAGE_ACTIVITY_END_DELAY = 100
export const PAGE_ACTIVITY_MAX_DURATION = 10_000

export interface PageActivityResult {
  hadActivity: boolean
  endTime?: number
}

export function waitIdlePageActivity(
  lifeCycle: LifeCycle,
  callback: (result: PageActivityResult) => void,
): { stop: () => void } {
  let pendingRequestsCount = 0
  let validationTimerId: ReturnType<typeof setTimeout> | undefined
  let endDelayTimerId: ReturnType<typeof setTimeout> | undefined
  let maxDurationTimerId: ReturnType<typeof setTimeout> | undefined
  let completed = false

  function complete(result: PageActivityResult) {
    if (completed) return
    completed = true
    clearTimeout(validationTimerId)
    clearTimeout(endDelayTimerId)
    clearTimeout(maxDurationTimerId)
    startedSub.unsubscribe()
    completedSub.unsubscribe()
    callback(result)
  }

  function notifyActivity(isBusy: boolean) {
    clearTimeout(validationTimerId)
    clearTimeout(endDelayTimerId)

    if (!isBusy) {
      const lastChangeTime = Date.now()
      endDelayTimerId = setTimeout(() => {
        complete({ hadActivity: true, endTime: lastChangeTime })
      }, PAGE_ACTIVITY_END_DELAY)
    }
  }

  const startedSub = lifeCycle.subscribe(LifeCycleEventType.REQUEST_STARTED, () => {
    pendingRequestsCount++
    notifyActivity(true)
  })

  const completedSub = lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, () => {
    pendingRequestsCount = Math.max(0, pendingRequestsCount - 1)
    if (pendingRequestsCount === 0) {
      notifyActivity(false)
    }
  })

  validationTimerId = setTimeout(() => {
    complete({ hadActivity: false })
  }, PAGE_ACTIVITY_VALIDATION_DELAY)

  maxDurationTimerId = setTimeout(() => {
    complete({ hadActivity: true, endTime: Date.now() })
  }, PAGE_ACTIVITY_MAX_DURATION)

  return {
    stop: () => complete({ hadActivity: false }),
  }
}
