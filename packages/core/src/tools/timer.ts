export interface Timer {
  clear: () => void
}

export function createTimer(callback: () => void, delay: number): Timer {
  const handle = setTimeout(callback, delay)
  return {
    clear: () => clearTimeout(handle),
  }
}
