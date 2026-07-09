import { Observable } from '@flashcatcloud/miniprogram-core'

export type PageLifecycle = 'load' | 'show' | 'ready' | 'hide' | 'unload'

export interface PageEvent {
  route: string
  lifecycle: PageLifecycle
  time: number
}

export interface UserActionEvent {
  route: string
  type: string
  time: number
  targetName?: string
  x?: number
  y?: number
}

export interface SetDataEvent {
  route: string
  duration: number
  time: number
}

interface SetDataPerformanceResult {
  pendingStartTimestamp?: number
  updateEndTimestamp?: number
}

interface PageInstance {
  route?: string
  __flashcatSetDataListenerRegistered?: boolean
  setUpdatePerformanceListener?: (
    options: { withDataPaths?: boolean },
    callback: (result: SetDataPerformanceResult) => void,
  ) => void
}

declare let Page: (options: Record<string, any>) => void

// 只有真实的用户交互事件才算 action。组件事件（如 image 的 load/error、scroll、touchmove）
// 也会经过页面的事件处理函数（Taro 等框架还会统一路由到单个 handler），不能计入用户行为。
const USER_INTERACTION_EVENT_TYPES = new Set(['tap', 'longpress', 'longtap'])

export function initPageObservable() {
  const pageObservable = new Observable<PageEvent>()
  const actionObservable = new Observable<UserActionEvent>()
  const setDataObservable = new Observable<SetDataEvent>()
  const originalPage = Page

  function registerSetDataListener(page: PageInstance | undefined) {
    if (
      !page ||
      page.__flashcatSetDataListenerRegistered ||
      typeof page.setUpdatePerformanceListener !== 'function'
    ) {
      return
    }

    try {
      page.setUpdatePerformanceListener({ withDataPaths: true }, (result) => {
        const pendingStart = result.pendingStartTimestamp
        const updateEnd = result.updateEndTimestamp
        const route = page.route || ''

        if (typeof pendingStart === 'number' && typeof updateEnd === 'number' && updateEnd >= pendingStart) {
          setDataObservable.notify({
            route,
            duration: updateEnd - pendingStart,
            time: Date.now(),
          })
        }
      })
      page.__flashcatSetDataListenerRegistered = true
    } catch {
      // ignore unsupported runtimes
    }
  }

  function wrapHook(options: Record<string, any>, hookName: string, lifecycle: PageLifecycle) {
    const original = options[hookName]
    options[hookName] = function (...args: any[]) {
      const page = this as PageInstance | undefined
      const route = page?.route || ''
      if (hookName === 'onLoad' || hookName === 'onShow') {
        registerSetDataListener(page)
      }
      pageObservable.notify({ route, lifecycle, time: Date.now() })
      return original?.apply(this, args)
    }
  }

  function wrapActionHandlers(options: Record<string, any>) {
    Object.keys(options).forEach((key) => {
      const value = options[key]
      if (typeof value !== 'function') {
        return
      }
      options[key] = function (...args: any[]) {
        const event = args[0]
        if (event && typeof event.type === 'string' && USER_INTERACTION_EVENT_TYPES.has(event.type)) {
          const route = this?.route || ''
          const dataset = (event.currentTarget?.dataset || {}) as Record<string, string>
          actionObservable.notify({
            route,
            type: event.type,
            time: Date.now(),
            targetName: dataset.name || dataset.content || dataset.type || event.currentTarget?.id,
            x: event.detail?.x,
            y: event.detail?.y,
          })
        }
        return value.apply(this, args)
      }
    })
  }

  // eslint-disable-next-line no-global-assign
  Page = (options: Record<string, any>) => {
    wrapHook(options, 'onLoad', 'load')
    wrapHook(options, 'onShow', 'show')
    wrapHook(options, 'onReady', 'ready')
    wrapHook(options, 'onHide', 'hide')
    wrapHook(options, 'onUnload', 'unload')
    wrapActionHandlers(options)
    return originalPage(options)
  }

  return {
    pageObservable,
    actionObservable,
    setDataObservable,
    stop: () => {
      // eslint-disable-next-line no-global-assign
      Page = originalPage
    },
  }
}
