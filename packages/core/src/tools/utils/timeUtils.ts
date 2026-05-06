export const ONE_SECOND = 1000
export const ONE_MINUTE = 60 * ONE_SECOND

export function now() {
  return Date.now()
}

/**
 * 将毫秒时长转换为纳秒，与 browser-sdk 服务端格式对齐。
 * ServerDuration 单位为纳秒（ns），本地采集的时长均为毫秒（ms）。
 */
export function toServerDuration(durationMs: number): number
export function toServerDuration(durationMs: number | undefined): number | undefined
export function toServerDuration(durationMs: number | undefined): number | undefined {
  if (durationMs === undefined) {
    return undefined
  }
  return Math.round(durationMs * 1e6)
}
