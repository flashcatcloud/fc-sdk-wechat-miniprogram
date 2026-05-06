import type { Observable } from '@flashcatcloud/miniprogram-core'
import { generateUUID, toServerDuration } from '@flashcatcloud/miniprogram-core'
import type { UserActionEvent } from '@flashcatcloud/miniprogram-platform'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { trackEventCounts } from './trackEventCounts'
import { waitIdlePageActivity } from './trackPageActivity'


export function startActionCollection(lifeCycle: LifeCycle, actionObservable: Observable<UserActionEvent>) {
  let currentAction: { stop: () => void } | undefined

  const actionSub = actionObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.ACTION_COLLECTED, event)
    if (currentAction) return

    currentAction = createPendingAction(lifeCycle, event, () => {
      currentAction = undefined
    })
  })

  const pageSub = lifeCycle.subscribe(LifeCycleEventType.PAGE_EVENT, (pageEvent) => {
    if (pageEvent.lifecycle === 'load' && currentAction) {
      currentAction.stop()
      currentAction = undefined
    }
  })

  function addAction(name: string, type = 'custom') {
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: Date.now(),
      type: 'action',
      action: {
        id: generateUUID(),
        type,
        target: { name },
      },
    })
  }

  return {
    addAction,
    stop: () => {
      actionSub.unsubscribe()
      pageSub.unsubscribe()
      currentAction?.stop()
    },
  }
}

function createPendingAction(
  lifeCycle: LifeCycle,
  event: UserActionEvent,
  onDone: () => void,
): { stop: () => void } {
  const id = generateUUID()
  const startTime = event.time
  const eventCounts = trackEventCounts(lifeCycle)

  const activityTracker = waitIdlePageActivity(lifeCycle, (result) => {
    if (result.hadActivity && result.endTime !== undefined) {
      const loadingTimeMs = result.endTime - startTime
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: startTime,
        type: 'action',
        ...(event.x !== undefined && event.y !== undefined
          ? { _dd: { action: { position: { x: event.x, y: event.y } } } }
          : {}),
        action: {
          id,
          type: event.type,
          target: { name: event.targetName || 'unknown' },
          loading_time: toServerDuration(loadingTimeMs),
          error: { count: eventCounts.counts.errorCount },
          long_task: { count: 0 },
          resource: { count: eventCounts.counts.resourceCount },
        },
      })
    }
    eventCounts.stop()
    onDone()
  })

  return {
    stop: () => {
      activityTracker.stop()
      eventCounts.stop()
      onDone()
    },
  }
}
