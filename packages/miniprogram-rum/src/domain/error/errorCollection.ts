import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

export function startErrorCollection(lifeCycle: LifeCycle) {
  function addError(message: string, source: 'app' | 'promise' | 'custom', stack?: string) {
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, { message, stack, source })
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: Date.now(),
      type: 'error',
      error: {
        message,
        stack,
        source,
      },
    })
  }

  return {
    addError,
  }
}
