import type { Observable } from '@flashcatcloud/miniprogram-core'
import type { UserActionEvent } from '@flashcatcloud/miniprogram-platform'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

export function startActionCollection(lifeCycle: LifeCycle, actionObservable: Observable<UserActionEvent>) {
  const subscription = actionObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.ACTION_COLLECTED, event)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: event.time,
      type: 'action',
      action: {
        name: event.route || 'unknown',
        type: event.type,
      },
    })
  })

  function addAction(name: string, type = 'custom') {
    const time = Date.now()
    lifeCycle.notify(LifeCycleEventType.ACTION_COLLECTED, { name, type, time })
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: time,
      type: 'action',
      action: { name, type },
    })
  }

  return {
    addAction,
    stop: () => subscription.unsubscribe(),
  }
}
