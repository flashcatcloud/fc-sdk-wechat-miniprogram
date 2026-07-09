import test from 'node:test'
import assert from 'node:assert/strict'
import { initPageObservable } from '../packages/miniprogram-platform/src/browser/pageObservable'
import type { PageEvent, UserActionEvent } from '../packages/miniprogram-platform/src/browser/pageObservable'

function setup(pageOptions: Record<string, any>) {
  const globals = globalThis as any
  let registeredOptions: Record<string, any> | undefined
  globals.Page = (options: Record<string, any>) => {
    registeredOptions = options
  }

  const { pageObservable, actionObservable, stop } = initPageObservable()

  const actions: UserActionEvent[] = []
  const pageEvents: PageEvent[] = []
  actionObservable.subscribe((event) => actions.push(event))
  pageObservable.subscribe((event) => pageEvents.push(event))

  globals.Page(pageOptions)

  return {
    actions,
    pageEvents,
    page: registeredOptions!,
    cleanup: () => {
      stop()
      delete globals.Page
    },
  }
}

test('pageObservable emits an action for tap events with dataset target name', () => {
  const { actions, page, cleanup } = setup({
    handleTap() {},
  })

  page.handleTap({ type: 'tap', currentTarget: { dataset: { name: 'buy-button' } }, detail: { x: 1, y: 2 } })
  cleanup()

  assert.equal(actions.length, 1)
  assert.equal(actions[0].type, 'tap')
  assert.equal(actions[0].targetName, 'buy-button')
  assert.equal(actions[0].x, 1)
  assert.equal(actions[0].y, 2)
})

test('pageObservable emits actions for longpress and longtap events', () => {
  const { actions, page, cleanup } = setup({
    handlePress() {},
  })

  page.handlePress({ type: 'longpress', currentTarget: { dataset: { name: 'card' } } })
  page.handlePress({ type: 'longtap', currentTarget: { dataset: { name: 'card' } } })
  cleanup()

  assert.deepEqual(
    actions.map((action) => action.type),
    ['longpress', 'longtap'],
  )
})

test('pageObservable ignores non-interaction events such as image load', () => {
  const { actions, page, cleanup } = setup({
    eh() {},
  })

  // Taro routes every component event through a universal handler; image load/error
  // events must not be recorded as user actions.
  page.eh({ type: 'load', currentTarget: { dataset: {} } })
  page.eh({ type: 'error', currentTarget: { dataset: {} } })
  page.eh({ type: 'scroll', currentTarget: { dataset: {} } })
  page.eh({ type: 'touchmove', currentTarget: { dataset: {} } })
  cleanup()

  assert.equal(actions.length, 0)
})

test('pageObservable falls back to currentTarget.id when dataset has no name', () => {
  const { actions, page, cleanup } = setup({
    handleTap() {},
  })

  page.handleTap({ type: 'tap', currentTarget: { id: 'submit-btn', dataset: {} } })
  cleanup()

  assert.equal(actions.length, 1)
  assert.equal(actions[0].targetName, 'submit-btn')
})

test('pageObservable prefers mark.name over currentTarget.id', () => {
  const { actions, page, cleanup } = setup({
    handleTap() {},
  })

  page.handleTap({ type: 'tap', mark: { name: 'marked-btn' }, currentTarget: { id: 'submit-btn', dataset: {} } })
  cleanup()

  assert.equal(actions.length, 1)
  assert.equal(actions[0].targetName, 'marked-btn')
})

test('pageObservable falls back to the event target for delegated handlers', () => {
  const { actions, page, cleanup } = setup({
    handleTap() {},
  })

  // Native pages often delegate: the handler sits on an ancestor without
  // naming, while the tapped element carries the dataset or id.
  page.handleTap({
    type: 'tap',
    currentTarget: { dataset: {} },
    target: { dataset: { name: 'inner-item' } },
  })
  page.handleTap({
    type: 'tap',
    currentTarget: { dataset: {} },
    target: { id: 'inner-id', dataset: {} },
  })
  cleanup()

  assert.deepEqual(
    actions.map((action) => action.targetName),
    ['inner-item', 'inner-id'],
  )
})

test('pageObservable leaves targetName undefined when nothing identifies the target', () => {
  const { actions, page, cleanup } = setup({
    handleTap() {},
  })

  page.handleTap({ type: 'tap', currentTarget: { dataset: {} } })
  cleanup()

  assert.equal(actions.length, 1)
  assert.equal(actions[0].targetName, undefined)
})

test('pageObservable still notifies page lifecycle events', () => {
  const { pageEvents, actions, page, cleanup } = setup({
    onLoad() {},
    onShow() {},
  })

  page.onLoad.call({ route: 'pages/index/index' }, {})
  page.onShow.call({ route: 'pages/index/index' })
  cleanup()

  assert.deepEqual(
    pageEvents.map((event) => event.lifecycle),
    ['load', 'show'],
  )
  assert.equal(actions.length, 0)
})

test('pageObservable keeps calling the original handler', () => {
  let called = 0
  const { page, cleanup } = setup({
    handleTap() {
      called += 1
    },
  })

  page.handleTap({ type: 'tap', currentTarget: { dataset: {} } })
  cleanup()

  assert.equal(called, 1)
})
