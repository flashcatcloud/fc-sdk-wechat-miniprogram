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

// Only genuine user interactions qualify as auto-collected actions. Component
// events (image load/error, scroll, touchmove, ...) flow through the same page
// handlers — frameworks like Taro even route every event through a single
// universal handler — and must not be recorded as user behavior.
const USER_INTERACTION_EVENT_TYPES = new Set(['tap', 'longpress', 'longtap'])

// WeChat reports fractional tap coordinates (logical pixels), but the RUM
// action schema types _dd.action.position.x/y as integers and the ingest
// decoder rejects floats — round at the collection boundary.
function toIntegerCoordinate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined
}

// The event object carries no element text, class, or tag name (there is no DOM
// to query), so naming relies on what integrators annotate: dataset attributes,
// mark:name, or an element id — on the handler's element first, then on the
// tapped element (delegated handlers). Anything beyond that stays unnamed.
function resolveTargetName(event: any): string | undefined {
  const nameFromDataset = (element: { dataset?: Record<string, string> } | undefined) => {
    const dataset = element?.dataset
    return dataset && (dataset.name || dataset.content || dataset.type)
  }
  return (
    nameFromDataset(event.currentTarget) ||
    event.mark?.name ||
    event.currentTarget?.id ||
    nameFromDataset(event.target) ||
    event.target?.id ||
    undefined
  )
}

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
          actionObservable.notify({
            route,
            type: event.type,
            time: Date.now(),
            targetName: resolveTargetName(event),
            x: toIntegerCoordinate(event.detail?.x),
            y: toIntegerCoordinate(event.detail?.y),
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
