export interface PageHistoryEntry {
  id: string
  name: string
  startTime: number
  loadTime?: number          // 页面 onLoad 时间，用于计算 loading_time
  documentVersion?: number
  updateIntervalId?: number  // 用于存储定时器 ID，便于清理
}

export function createPageHistory() {
  let current: PageHistoryEntry | undefined

  function startPage(name: string, time: number) {
    current = {
      id: `${time}-${Math.random().toString(16).slice(2)}`,
      name,
      startTime: time,
    }
    return current
  }

  function getCurrent() {
    return current
  }

  function stopPage(time: number) {
    if (!current) {
      return undefined
    }
    const ended = { ...current }
    current = undefined
    return { ...ended, endTime: time }
  }

  return {
    startPage,
    getCurrent,
    stopPage,
  }
}
