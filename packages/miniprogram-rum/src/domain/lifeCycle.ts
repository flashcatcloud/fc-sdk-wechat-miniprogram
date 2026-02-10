import { AbstractLifeCycle as BaseLifeCycle } from '@flashcatcloud/miniprogram-core'
import type { RawRumEvent } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'
import type { RequestCompleteEvent } from '@flashcatcloud/miniprogram-platform'
import type { PageEvent, UserActionEvent } from '@flashcatcloud/miniprogram-platform'

export const enum LifeCycleEventType {
  PAGE_EVENT,
  REQUEST_COMPLETED,
  ERROR_COLLECTED,
  ACTION_COLLECTED,
  PERFORMANCE_COLLECTED,
  CUSTOM_EVENT_COLLECTED,
  RAW_RUM_EVENT_COLLECTED,
  RUM_EVENT_COLLECTED,
}

export type LifeCycleEventMap = {
  [LifeCycleEventType.PAGE_EVENT]: PageEvent
  [LifeCycleEventType.REQUEST_COMPLETED]: RequestCompleteEvent
  [LifeCycleEventType.ERROR_COLLECTED]: { message: string; stack?: string; source: 'app' | 'promise' | 'custom' }
  [LifeCycleEventType.ACTION_COLLECTED]: UserActionEvent | { name: string; type: string; time: number; route?: string }
  [LifeCycleEventType.PERFORMANCE_COLLECTED]: { name: string; value: number; time: number }
  [LifeCycleEventType.CUSTOM_EVENT_COLLECTED]: { name: string; context?: Record<string, unknown>; time: number }
  [LifeCycleEventType.RAW_RUM_EVENT_COLLECTED]: RawRumEvent
  [LifeCycleEventType.RUM_EVENT_COLLECTED]: RumEvent
}

export class LifeCycle extends BaseLifeCycle<LifeCycleEventMap> {}
