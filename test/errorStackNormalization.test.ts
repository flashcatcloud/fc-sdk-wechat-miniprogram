import test from 'node:test'
import assert from 'node:assert/strict'
import { LifeCycle, LifeCycleEventType } from '../packages/miniprogram-rum/src/domain/lifeCycle'
import { startErrorCollection } from '../packages/miniprogram-rum/src/domain/error/errorCollection'
import type { RawRumErrorEvent } from '../packages/miniprogram-rum/src/rawRumEvent.types'

function collectError(error: string | Error, stack?: string) {
  const lifeCycle = new LifeCycle()
  const collected: RawRumErrorEvent[] = []
  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => {
    if (event.type === 'error') {
      collected.push(event)
    }
  })

  startErrorCollection(lifeCycle).addError(error, 'promise', stack)

  assert.equal(collected.length, 1)
  return collected[0].error
}

test('normalizes real-device JavaScriptCore miniprogram stack', () => {
  const original = `handleUnhandledPromiseRejection@https://usr//chunk_6.appservice.js:189:952
@[native code]
@https://lib/WASubContext.js:1:356139
handleTap@https://usr//chunk_0.appservice.js:550:2517
global code@`

  const error = collectError('这是一个自动捕获的 Promise 拒绝测试', original)

  assert.equal(error.message, '这是一个自动捕获的 Promise 拒绝测试')
  assert.equal(
    error.stack,
    `Error: 这是一个自动捕获的 Promise 拒绝测试
  at handleUnhandledPromiseRejection @ chunk_6.appservice.js:189:952
  at <anonymous> @ https://lib/WASubContext.js:1:356139
  at handleTap @ chunk_0.appservice.js:550:2517`,
  )
})

test('normalizes developer-tool V8 miniprogram stack embedded in message', () => {
  const original = `Error: 这是一个自动捕获的 Promise 拒绝测试
    at ai.handleUnhandledPromiseRejection (weapp:///pages/rum-demo/error.js:27:20)
    at ai.options.<computed> [as handleUnhandledPromiseRejection] (weapp:///http://127.0.0.1:18025/appservice/miniprogram_npm/@flashcatcloud/miniprogram-platform/browser/pageObservable.js?t=wechat&s=1778826434023&v=3cba57e60af9690a:81:22)
    at ai.<anonymous> (http://127.0.0.1:18025/appservice/__dev__/WASubContext.js?t=wechat&v=3.14.2:1:356138)`

  const error = collectError(original)

  assert.equal(error.message, '这是一个自动捕获的 Promise 拒绝测试')
  assert.equal(
    error.stack,
    `Error: 这是一个自动捕获的 Promise 拒绝测试
  at ai.handleUnhandledPromiseRejection @ pages/rum-demo/error.js:27:20
  at ai.options.<computed> [as handleUnhandledPromiseRejection] @ miniprogram_npm/@flashcatcloud/miniprogram-platform/browser/pageObservable.js:81:22
  at ai.<anonymous> @ __dev__/WASubContext.js:1:356138`,
  )
})

test('normalizes browser-style Chrome stack from Error objects', () => {
  const err = new Error('chrome boom')
  err.stack = `Error: chrome boom
    at submitOrder (https://example.com/app.js:10:20)
    at https://example.com/app.js:15:3`

  const error = collectError(err)

  assert.equal(error.message, 'chrome boom')
  assert.equal(
    error.stack,
    `Error: chrome boom
  at submitOrder @ https://example.com/app.js:10:20
  at <anonymous> @ https://example.com/app.js:15:3`,
  )
})

test('normalizes DataKit-supported Gecko stack from Error objects', () => {
  const err = new Error('gecko boom')
  err.name = 'TypeError'
  err.stack = `submitOrder@https://example.com/app.js:41:13
@https://example.com/app.js:1:1`

  const error = collectError(err)

  assert.equal(error.message, 'gecko boom')
  assert.equal(
    error.stack,
    `TypeError: gecko boom
  at submitOrder @ https://example.com/app.js:41:13
  at <anonymous> @ https://example.com/app.js:1:1`,
  )
})
