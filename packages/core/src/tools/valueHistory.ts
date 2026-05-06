export interface ValueHistoryEntry<T> {
  startTime: number
  value: T
}

export interface ValueHistory<T> {
  add: (value: T) => void
  find: (time: number) => ValueHistoryEntry<T> | undefined
}

export function createValueHistory<T>(clock: () => number): ValueHistory<T> {
  const history: ValueHistoryEntry<T>[] = []
  return {
    add: (value) => {
      history.push({ startTime: clock(), value })
    },
    find: (time) => {
      for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i].startTime <= time) {
          return history[i]
        }
      }
      return undefined
    },
  }
}
