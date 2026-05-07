import test from 'node:test'
import assert from 'node:assert/strict'
import { createContextManager, startSessionManager } from '../packages/core/src'
import { LifeCycle, LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import { startRumAssembly } from '../packages/miniprogram-rum/src/domain/assembly'
import { validateAndBuildRumConfiguration } from '../packages/miniprogram-rum/src/domain/configuration/configuration'
import { startUserContext } from '../packages/miniprogram-rum/src/domain/contexts/userContext'
import type { PlatformAdapter } from '../packages/miniprogram-platform/src'
import type { RawRumEvent } from '../packages/miniprogram-rum/src/rawRumEvent.types'
import type { RumEvent } from '../packages/miniprogram-rum/src/rumEvent.types'
import type { SessionState } from '../packages/core/src'

function createStore() {
  let stored: SessionState | undefined
  return {
    get: () => stored,
    set: (state: SessionState) => {
      stored = state
    },
    clear: () => {
      stored = undefined
    },
  }
}

const adapter = {
  getNetworkType: ({ success }: { success: (res: { networkType: string }) => void }) => success({ networkType: 'wifi' }),
  onNetworkStatusChange: () => undefined,
} as unknown as PlatformAdapter

function collectAssembledEvent({
  rawEvent,
  userContext = startUserContext(),
  trackAnonymousUser,
}: {
  rawEvent: RawRumEvent
  userContext?: ReturnType<typeof startUserContext>
  trackAnonymousUser?: boolean
}) {
  const configuration = validateAndBuildRumConfiguration({
    clientToken: 'token',
    applicationId: 'app',
    trackAnonymousUser,
  })!
  const lifeCycle = new LifeCycle()
  const sessionManager = startSessionManager(createStore(), { trackAnonymousUser: configuration.trackAnonymousUser })
  const collected: RumEvent[] = []
  const assembly = startRumAssembly({
    lifeCycle,
    configuration,
    sessionManager,
    globalContext: createContextManager(),
    userContext,
    getCurrentPage: () => ({ id: 'view-id', name: 'page-name', startTime: Date.now() }),
    adapter,
  })

  try {
    lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => collected.push(event))
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rawEvent)
    return { event: collected[0], session: sessionManager.findTrackedSession() }
  } finally {
    assembly.stop()
  }
}

test('miniprogram RUM assembles user context as usr for backend compatibility', () => {
  const userContext = startUserContext()
  userContext.setContext({ id: 'user-123', name: 'Ada', email: 'ada@example.com', anonymous_id: 'custom-aid' })

  const { event } = collectAssembledEvent({
    userContext,
    rawEvent: {
      date: Date.now(),
      type: 'action',
      action: { type: 'custom', target: { name: 'checkout' } },
    },
  })

  assert.deepEqual(event.usr, {
    id: 'user-123',
    name: 'Ada',
    email: 'ada@example.com',
    anonymous_id: 'custom-aid',
  })
  assert.equal('user' in event, false)
})

test('miniprogram RUM auto-populates usr anonymous_id when anonymous tracking is enabled', () => {
  const { event, session } = collectAssembledEvent({
    rawEvent: {
      date: Date.now(),
      type: 'action',
      action: { type: 'custom', target: { name: 'checkout' } },
    },
  })

  assert.ok(session?.anonymousId)
  assert.deepEqual(event.usr, {
    id: session?.anonymousId,
    anonymous_id: session?.anonymousId,
  })
})

test('miniprogram RUM preserves explicit usr id while adding generated anonymous_id', () => {
  const userContext = startUserContext()
  userContext.setContext({ id: 'user-123' })

  const { event, session } = collectAssembledEvent({
    userContext,
    rawEvent: {
      date: Date.now(),
      type: 'action',
      action: { type: 'custom', target: { name: 'checkout' } },
    },
  })

  assert.deepEqual(event.usr, {
    id: 'user-123',
    anonymous_id: session?.anonymousId,
  })
})

test('miniprogram RUM omits usr when no user is set and anonymous tracking is disabled', () => {
  const { event, session } = collectAssembledEvent({
    trackAnonymousUser: false,
    rawEvent: {
      date: Date.now(),
      type: 'action',
      action: { type: 'custom', target: { name: 'checkout' } },
    },
  })

  assert.equal(session?.anonymousId, undefined)
  assert.equal(event.usr, undefined)
})

test('miniprogram user context follows web predefined property string coercion', () => {
  const userContext = startUserContext()
  userContext.setContext({ id: false, name: 2, email: { bar: 'qux' }, tier: 1 })

  assert.deepEqual(userContext.getContext(), {
    id: 'false',
    name: '2',
    email: '[object Object]',
    tier: 1,
  })

  userContext.setContextProperty('id', 123)
  assert.deepEqual(userContext.getContext(), {
    id: '123',
    name: '2',
    email: '[object Object]',
    tier: 1,
  })
})

test('miniprogram RUM configuration defaults anonymous tracking to true', () => {
  const configuration = validateAndBuildRumConfiguration({
    clientToken: 'token',
    applicationId: 'app',
  })!

  assert.equal(configuration.trackAnonymousUser, true)
})

test('miniprogram RUM configuration can disable anonymous tracking', () => {
  const configuration = validateAndBuildRumConfiguration({
    clientToken: 'token',
    applicationId: 'app',
    trackAnonymousUser: false,
  })!

  assert.equal(configuration.trackAnonymousUser, false)
})
