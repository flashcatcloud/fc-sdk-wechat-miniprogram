import type { Configuration, InitConfiguration, TraceContext } from '@flashcatcloud/miniprogram-core'
import { validateAndBuildConfiguration } from '@flashcatcloud/miniprogram-core'

export interface RumInitConfiguration extends InitConfiguration {
  trackActions?: boolean
  trackRequests?: boolean
  trackErrors?: boolean
  trackPerformance?: boolean
  trackPages?: boolean
  
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
     * 采样率 (0-1)
     * @default 1.0 (100% 采样)
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
  tracing: {
    enabled: boolean
    sampleRate: number
    rootTraceContext?: TraceContext
    headerName: string
  }
}

export function validateAndBuildRumConfiguration(
  initConfiguration: RumInitConfiguration
): RumConfiguration | undefined {
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
    tracing: {
      enabled: initConfiguration.tracing?.enabled ?? false,
      sampleRate: initConfiguration.tracing?.sampleRate ?? 1.0,
      rootTraceContext: initConfiguration.tracing?.rootTraceContext,
      headerName: initConfiguration.tracing?.headerName ?? 'traceparent',
    },
  }
}
