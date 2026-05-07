import test from 'node:test'
import assert from 'node:assert/strict'
import { Observable } from '../packages/core/src/tools/observable'
import { LifeCycle, LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import { startRequestCollection } from '../packages/miniprogram-rum/src/domain/request/requestCollection'
import type { RequestCompleteEvent } from '../packages/miniprogram-platform/src/browser/requestObservable'

test('requestCollection maps trace identifiers to resource event', () => {
  const lifeCycle = new LifeCycle()
  const requestObservable = new Observable<RequestCompleteEvent>()
  const collected: any[] = []

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => collected.push(event))
  startRequestCollection(lifeCycle, requestObservable)

  requestObservable.notify({
    url: 'https://api.example.com/data',
    method: 'GET',
    startTime: 1,
    duration: 10,
    statusCode: 200,
    requestType: 'xhr',
    traceId: '0af7651916cd43dd8448eb211c80319c',
    spanId: 'b7ad6b7169203331',
  })

  assert.equal(collected.length, 1)
  assert.equal(collected[0].resource.trace_id, '0af7651916cd43dd8448eb211c80319c')
  assert.equal(collected[0].resource.span_id, 'b7ad6b7169203331')
})
