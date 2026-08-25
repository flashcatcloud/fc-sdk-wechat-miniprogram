import type { Configuration, InitConfiguration, ProxyFn, TraceContext } from '@flashcatcloud/miniprogram-core'
import { validateAndBuildConfiguration } from '@flashcatcloud/miniprogram-core'

export interface RumInitConfiguration extends InitConfiguration {
  trackActions?: boolean
  trackRequests?: boolean
  trackErrors?: boolean
  trackPerformance?: boolean
  trackPages?: boolean

  /**
   * 事件速率限制阈值（每分钟每种事件类型的最大数量）
   * @default 3000
   */
  eventRateLimiterThreshold?: number

  /**
   * 分布式追踪配置
   */
  tracing?: {
    /**
     * 是否启用分布式追踪
     * @default false
     */
    enabled?: boolean

    /**
     * 采样率百分比：100 表示全量采样，0 表示不采样
     * @default 100
     */
    sampleRate?: number

    /**
     * 根 trace context (可选)
     * 如果提供，所有请求将作为此 trace 的子 span
     */
    rootTraceContext?: TraceContext

    /**
     * 自定义 trace header 名称 (可选)
     * @default 'traceparent'
     */
    headerName?: string
  }
}

export interface RumConfiguration extends Configuration {
  trackActions: boolean
  trackRequests: boolean
  trackErrors: boolean
  trackPerformance: boolean
  trackPages: boolean
  eventRateLimiterThreshold: number
  trackAnonymousUser: boolean
  tracing: {
    enabled: boolean
    sampleRate: number
    rootTraceContext?: TraceContext
    headerName: string
  }
  remoteConfigurationSource: {
    proxy?: string | ProxyFn
    site?: string
  }
}

export function validateAndBuildRumConfiguration(
  initConfiguration: RumInitConfiguration,
): RumConfiguration | undefined {
  if (!isTraceSampleRate(initConfiguration.tracing?.sampleRate)) {
    return
  }

  const base = validateAndBuildConfiguration(initConfiguration)
  if (!base) {
    return
  }
  return {
    ...base,
    trackActions: initConfiguration.trackActions ?? true,
    trackRequests: initConfiguration.trackRequests ?? true,
    trackErrors: initConfiguration.trackErrors ?? true,
    trackPerformance: initConfiguration.trackPerformance ?? true,
    trackPages: initConfiguration.trackPages ?? true,
    eventRateLimiterThreshold: initConfiguration.eventRateLimiterThreshold ?? 3000,
    trackAnonymousUser: base.trackAnonymousUser,
    tracing: {
      enabled: initConfiguration.tracing?.enabled ?? false,
      sampleRate: initConfiguration.tracing?.sampleRate ?? 100,
      rootTraceContext: initConfiguration.tracing?.rootTraceContext,
      headerName: initConfiguration.tracing?.headerName ?? 'traceparent',
    },
    remoteConfigurationSource: {
      proxy: initConfiguration.proxy,
      site: initConfiguration.site,
    },
  }
}

function isTraceSampleRate(sampleRate: unknown): boolean {
  if (
    sampleRate !== undefined &&
    (typeof sampleRate !== 'number' || Number.isNaN(sampleRate) || sampleRate < 0 || sampleRate > 100)
  ) {
    console.error('[FlashCat RUM][Error] Trace Sample Rate should be a number between 0 and 100')
    return false
  }
  return true
}
