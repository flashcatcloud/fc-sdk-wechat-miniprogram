import {
  createBatch,
  createFlushController,
  createIdentityEncoder,
  loadAndClearPersistedPayloads,
  Observable,
} from '@flashcatcloud/miniprogram-core'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { RumConfiguration } from '../domain/configuration/configuration'
import type { SessionManager } from '@flashcatcloud/miniprogram-core'
import { startWithheldEventBuffer } from './withheldEventBuffer'
import type { PlatformAdapter } from '@flashcatcloud/miniprogram-platform'
import { createHttpRequest } from '@flashcatcloud/miniprogram-platform'
import type { AppEvent } from '@flashcatcloud/miniprogram-platform'

/** An event serialized to this many characters or more never leaves the batch. */
export const MESSAGE_BYTES_LIMIT = 256 * 1024

export function startRumBatch(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  adapter: PlatformAdapter,
  appObservable: Observable<AppEvent>,
  sessionManager: SessionManager,
) {
  const encoder = createIdentityEncoder()
  const request = createHttpRequest(adapter, configuration.endpointBuilder, configuration.debug)

  const appExitObservable = new Observable<void>((observable) => {
    const subscription = appObservable.subscribe((event) => {
      if (event.lifecycle === 'hide') {
        // A release still waiting on its jitter has to reach the batch before this flush, which is
        // the last chance the app may get to send it.
        withheldEventBuffer.flushOnAppHide()
        observable.notify()
      }
    })
    return () => subscription.unsubscribe()
  })

  const flushController = createFlushController({
    flushInterval: configuration.flushInterval,
    batchBytesLimit: 64 * 1024,
    messagesLimit: 50,
    appExitObservable,
  })

  const persistedPayloads = loadAndClearPersistedPayloads(adapter)
  persistedPayloads.forEach((payload) => {
    request.send(payload)
  })

  const batch = createBatch({
    encoder,
    request,
    flushController,
    messageBytesLimit: MESSAGE_BYTES_LIMIT,
  })

  // Events reach the batch through the buffer, which forwards them straight away unless their
  // session withholds them until it reports an error.
  const withheldEventBuffer = startWithheldEventBuffer(
    lifeCycle,
    sessionManager,
    (event) => {
      if (configuration.debug) {
        try {
          console.log('[FlashCat RUM][Debug] RUM event collected', {
            type: event.type,
            date: event.date,
            event,
          })
        } catch {
          // Console implementations are host code and must not cost an event, let alone a release.
        }
      }
      batch.add(event as unknown as Record<string, unknown>)
    },
    configuration.debug,
  )

  if (configuration.debug) {
    console.log('[FlashCat RUM][Debug] Batch reporting started', {
      flushInterval: `${configuration.flushInterval}ms`,
      maxMessageSize: '256KB',
    })
  }

  return {
    stop: () => {
      // Released history goes into the batch while it is still listening.
      withheldEventBuffer.stop()
      batch.stop()
    },
  }
}
