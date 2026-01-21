export function monitor<T extends (...args: any[]) => any>(fn: T): T {
  return ((...args: Parameters<T>) => {
    try {
      return fn(...args)
    } catch (error) {
      monitorError(error)
      throw error
    }
  }) as T
}

export function callMonitored(fn: () => void) {
  monitor(fn)()
}

export function monitorError(error: unknown) {
  // eslint-disable-next-line no-console
  console.error(error)
}
