import { Observable } from './observable'

export type ObservableCallback<T> = (data: T) => void

export class AbstractLifeCycle<EventMap extends Record<string, unknown>> {
  private observables: { [K in keyof EventMap]?: Observable<EventMap[K]> } = {}

  subscribe<K extends keyof EventMap>(eventType: K, callback: ObservableCallback<EventMap[K]>) {
    return this.getObservable(eventType).subscribe(callback)
  }

  notify<K extends keyof EventMap>(eventType: K, data: EventMap[K]) {
    this.getObservable(eventType).notify(data)
  }

  private getObservable<K extends keyof EventMap>(eventType: K): Observable<EventMap[K]> {
    if (!this.observables[eventType]) {
      this.observables[eventType] = new Observable<EventMap[K]>()
    }
    return this.observables[eventType] as Observable<EventMap[K]>
  }
}
