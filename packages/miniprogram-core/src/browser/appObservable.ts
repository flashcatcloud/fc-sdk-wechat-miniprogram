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

export function initAppObservable(adapter: PlatformAdapter) {
  const appObservable = new Observable<AppEvent>()
  const errorObservable = new Observable<AppErrorEvent>()
  const unhandledRejectionObservable = new Observable<AppUnhandledRejectionEvent>()

  adapter.onAppShow(() => appObservable.notify({ lifecycle: 'show', time: Date.now() }))
  adapter.onAppHide(() => appObservable.notify({ lifecycle: 'hide', time: Date.now() }))
  adapter.onError((message) => errorObservable.notify({ message, time: Date.now() }))
  adapter.onUnhandledRejection((res) => unhandledRejectionObservable.notify({ reason: res.reason, time: Date.now() }))

  return {
    appObservable,
    errorObservable,
    unhandledRejectionObservable,
  }
}
