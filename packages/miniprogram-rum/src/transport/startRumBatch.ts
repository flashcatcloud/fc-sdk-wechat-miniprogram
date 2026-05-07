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
import type { PlatformAdapter } from '@flashcatcloud/miniprogram-platform'
import { createHttpRequest } from '@flashcatcloud/miniprogram-platform'
import type { AppEvent } from '@flashcatcloud/miniprogram-platform'

export function startRumBatch(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  adapter: PlatformAdapter,
  appObservable: Observable<AppEvent>,
) {
  const encoder = createIdentityEncoder()
  const request = createHttpRequest(adapter, configuration.endpointBuilder, configuration.debug)

  const appExitObservable = new Observable<void>((observable) => {
    const subscription = appObservable.subscribe((event) => {
      if (event.lifecycle === 'hide') {
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
    messageBytesLimit: 256 * 1024,
  })

  const subscription = lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => {
    if (configuration.debug) {
      console.log('[FlashCat RUM][Debug] RUM event collected', {
        type: (event as any).type,
        date: (event as any).date,
        event,
      })
    }
    batch.add(event as unknown as Record<string, unknown>)
  })

  if (configuration.debug) {
    console.log('[FlashCat RUM][Debug] Batch reporting started', {
      flushInterval: `${configuration.flushInterval}ms`,
      maxMessageSize: '256KB',
    })
  }

  return {
    stop: () => {
      subscription.unsubscribe()
      batch.stop()
    },
  }
}
