import { AbstractLifeCycle as BaseLifeCycle } from '@flashcatcloud/miniprogram-core'
import type { RawRumEvent, RawRumViewEvent } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'
import type { RequestCompleteEvent, RequestStartEvent } from '@flashcatcloud/miniprogram-platform'
import type { PageEvent, UserActionEvent } from '@flashcatcloud/miniprogram-platform'

export const enum LifeCycleEventType {
  PAGE_EVENT,
  REQUEST_COMPLETED,
  ERROR_COLLECTED,
  ACTION_COLLECTED,
  PERFORMANCE_ENTRY_COLLECTED,
  CUSTOM_TIMING_COLLECTED,
  PAGE_SETDATA_COLLECTED,
  CUSTOM_EVENT_COLLECTED,
  RAW_RUM_EVENT_COLLECTED,
  RUM_EVENT_COLLECTED,
  REQUEST_STARTED,
}

export type LifeCycleEventMap = {
  [LifeCycleEventType.PAGE_EVENT]: PageEvent
  [LifeCycleEventType.REQUEST_COMPLETED]: RequestCompleteEvent
  [LifeCycleEventType.REQUEST_STARTED]: RequestStartEvent
  [LifeCycleEventType.ERROR_COLLECTED]: {
    message: string
    stack?: string
    source: 'app' | 'promise' | 'custom'
  }
  [LifeCycleEventType.ACTION_COLLECTED]: UserActionEvent | { name: string; type: string; time: number; route?: string }
  [LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED]: {
    route?: string
    metrics: Partial<RawRumViewEvent['view']>
  }
  [LifeCycleEventType.CUSTOM_TIMING_COLLECTED]: {
    name: string
    time?: number
    now: number
  }
  [LifeCycleEventType.PAGE_SETDATA_COLLECTED]: {
    route: string
    time: number
    duration: number
  }
  [LifeCycleEventType.CUSTOM_EVENT_COLLECTED]: {
    name: string
    context?: Record<string, unknown>
    time: number
  }
  [LifeCycleEventType.RAW_RUM_EVENT_COLLECTED]: RawRumEvent
  [LifeCycleEventType.RUM_EVENT_COLLECTED]: RumEvent
}

export class LifeCycle extends BaseLifeCycle<LifeCycleEventMap> {}
