export interface ValueHistoryEntry<T> {
  startTime: number
  endTime: number
  value: T
}

export interface ValueHistory<T> {
  add: (value: T, startTime?: number) => void
  closeActive: (endTime: number) => void
  find: (time: number) => ValueHistoryEntry<T> | undefined
  stop: () => void
}

export interface ValueHistoryOptions {
  expireDelay: number
  maxEntries?: number
}

export function createValueHistory<T>(
  clock: () => number,
  { expireDelay, maxEntries }: ValueHistoryOptions,
): ValueHistory<T> {
  const entries: ValueHistoryEntry<T>[] = []
  let activeEntry: ValueHistoryEntry<T> | undefined

  function clearExpiredValues() {
    const oldTimeThreshold = clock() - expireDelay
    while (entries.length > 0 && entries[entries.length - 1].endTime < oldTimeThreshold) {
      entries.pop()
    }
  }

  return {
    add: (value, startTime) => {
      clearExpiredValues()
      const entry: ValueHistoryEntry<T> = {
        startTime: startTime ?? clock(),
        endTime: Infinity,
        value,
      }
      if (activeEntry) {
        activeEntry.endTime = entry.startTime
      }
      activeEntry = entry

      if (maxEntries && entries.length >= maxEntries) {
        entries.pop()
      }
      entries.unshift(entry)
    },

    closeActive: (endTime) => {
      if (activeEntry) {
        activeEntry.endTime = endTime
        activeEntry = undefined
      }
    },

    find: (time) => {
      clearExpiredValues()
      for (let i = 0; i < entries.length; i += 1) {
        if (entries[i].startTime <= time && time < entries[i].endTime) {
          return entries[i]
        }
      }
      return undefined
    },

    stop: () => {
      // Kept for callers that manage histories through a common lifecycle.
    },
  }
}
