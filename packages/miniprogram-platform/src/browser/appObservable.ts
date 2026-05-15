import { Observable } from '@flashcatcloud/miniprogram-core'
import type { PlatformAdapter } from '../platform/types'

export type AppLifecycle = 'show' | 'hide'

export interface AppEvent {
  lifecycle: AppLifecycle
  time: number
}

export interface AppErrorEvent {
  message: string
  time: number
}

export interface AppUnhandledRejectionEvent {
  reason: string
  time: number
}

export interface AppPageNotFoundEvent {
  path: string
  query?: Record<string, string>
  isEntryPage?: boolean
  time: number
}

export interface AppLazyLoadErrorEvent {
  type: string
  subpackage?: Array<{ name?: string; root?: string; pages?: string[] }>
  errMsg?: string
  time: number
}

export function initAppObservable(adapter: PlatformAdapter) {
  const appObservable = new Observable<AppEvent>()
  const errorObservable = new Observable<AppErrorEvent>()
  const unhandledRejectionObservable = new Observable<AppUnhandledRejectionEvent>()
  const pageNotFoundObservable = new Observable<AppPageNotFoundEvent>()
  const lazyLoadErrorObservable = new Observable<AppLazyLoadErrorEvent>()

  adapter.onAppShow(() => appObservable.notify({ lifecycle: 'show', time: Date.now() }))
  adapter.onAppHide(() => appObservable.notify({ lifecycle: 'hide', time: Date.now() }))
  adapter.onError((message) => errorObservable.notify({ message, time: Date.now() }))
  adapter.onUnhandledRejection((res) =>
    unhandledRejectionObservable.notify({
      reason: res.reason,
      time: Date.now(),
    }),
  )
  adapter.onPageNotFound((res) =>
    pageNotFoundObservable.notify({
      path: res.path,
      query: res.query,
      isEntryPage: res.isEntryPage,
      time: Date.now(),
    }),
  )
  adapter.onLazyLoadError((res) =>
    lazyLoadErrorObservable.notify({
      type: res.type,
      subpackage: res.subpackage,
      errMsg: res.errMsg,
      time: Date.now(),
    }),
  )

  return {
    appObservable,
    errorObservable,
    unhandledRejectionObservable,
    pageNotFoundObservable,
    lazyLoadErrorObservable,
    stop: () => {
      appObservable.clear()
      errorObservable.clear()
      unhandledRejectionObservable.clear()
      pageNotFoundObservable.clear()
      lazyLoadErrorObservable.clear()
    },
  }
}
