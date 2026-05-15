import { generateUUID } from '@flashcatcloud/miniprogram-core'
import type { ErrorSource } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

export interface ErrorWithFingerprint extends Error {
  dd_fingerprint?: string
}

export interface AddErrorOptions {
  fingerprint?: string
}

export function startErrorCollection(lifeCycle: LifeCycle) {
  function addError(
    error: string | ErrorWithFingerprint,
    source: ErrorSource,
    stackOrOptions?: string | AddErrorOptions,
  ) {
    let message: string
    let stack: string | undefined
    let fingerprint: string | undefined

    if (typeof error === 'string') {
      message = error
      stack = typeof stackOrOptions === 'string' ? stackOrOptions : undefined
      fingerprint = typeof stackOrOptions === 'object' ? stackOrOptions.fingerprint : undefined
    } else {
      message = error.message
      stack = error.stack
      fingerprint =
        error.dd_fingerprint ?? (typeof stackOrOptions === 'object' ? stackOrOptions.fingerprint : undefined)
    }

    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, { message, stack, source })
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      date: Date.now(),
      type: 'error',
      error: {
        id: generateUUID(),
        message,
        stack,
        source,
        fingerprint,
      },
    })
  }

  return {
    addError,
  }
}
