import { createBatch, createFlushController, createIdentityEncoder } from '@flashcatcloud/miniprogram-core'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { RumConfiguration } from '../domain/configuration/configuration'
import type { PlatformAdapter } from '@flashcatcloud/miniprogram-platform'
import { createHttpRequest } from '@flashcatcloud/miniprogram-platform'

export function startRumBatch(configuration: RumConfiguration, lifeCycle: LifeCycle, adapter: PlatformAdapter) {
  const encoder = createIdentityEncoder()
  const request = createHttpRequest(adapter, configuration.endpointBuilder)
  const flushController = createFlushController(configuration.flushInterval, 64 * 1024)

  const batch = createBatch({
    encoder,
    request,
    flushController,
    messageBytesLimit: 256 * 1024,
  })

  const subscription = lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => {
    batch.add(event as unknown as Record<string, unknown>)
  })

  return {
    stop: () => {
      subscription.unsubscribe()
      batch.stop()
    },
  }
}
