import { Observable } from '../../tools/observable'

export type TelemetryEvent = {
  type: 'debug' | 'error'
  message: string
  data?: Record<string, unknown>
}

export interface Telemetry {
  observable: Observable<TelemetryEvent>
  addDebug: (message: string, data?: Record<string, unknown>) => void
  addError: (message: string, data?: Record<string, unknown>) => void
}

export function startTelemetry(): Telemetry {
  const observable = new Observable<TelemetryEvent>()
  return {
    observable,
    addDebug: (message, data) => observable.notify({ type: 'debug', message, data }),
    addError: (message, data) => observable.notify({ type: 'error', message, data }),
  }
}
