/**
 * W3C Trace Context 实现 (OpenTelemetry 标准)
 *
 * 标准参考:
 * - https://www.w3.org/TR/trace-context/
 * - https://opentelemetry.io/docs/concepts/context-propagation/
 *
 * traceparent 格式:
 * version-trace-id-parent-id-trace-flags
 * 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 *
 * OpenTelemetry 使用 W3C Trace Context 作为默认的上下文传播机制
 */

export interface TraceContext {
  /**
   * 128-bit trace ID (32 hex characters)
   * 全局唯一标识，标识整个请求链路
   */
  traceId: string

  /**
   * 64-bit span ID (16 hex characters)
   * 当前 span 的唯一标识
   */
  spanId: string

  /**
   * 8-bit trace flags
   * - 01: sampled (采样)
   * - 00: not sampled (不采样)
   */
  traceFlags: '01' | '00'

  /**
   * parent span ID (可选)
   * 用于建立 span 的父子关系
   */
  parentSpanId?: string
}

/**
 * 生成随机的十六进制字符串
 */
function randomHex(length: number): string {
  let result = ''
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 16).toString(16)
  }
  return result
}

/**
 * 生成 128-bit trace ID (32 个十六进制字符)
 */
export function generateTraceId(): string {
  return randomHex(32)
}

/**
 * 生成 64-bit span ID (16 个十六进制字符)
 */
export function generateSpanId(): string {
  return randomHex(16)
}

/**
 * 创建新的 trace context
 */
export function createTraceContext(sampled = true): TraceContext {
  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    traceFlags: sampled ? '01' : '00',
  }
}

/**
 * 创建子 span context (继承 trace ID，生成新的 span ID)
 */
export function createChildSpan(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    traceFlags: parent.traceFlags,
    parentSpanId: parent.spanId,
  }
}

/**
 * 生成 W3C traceparent header 值
 *
 * 格式: version-trace_id-parent_id-trace_flags
 * 示例: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 */
export function generateTraceparent(ctx: TraceContext): string {
  return `00-${ctx.traceId}-${ctx.spanId}-${ctx.traceFlags}`
}

/**
 * 解析 traceparent header
 *
 * @param header traceparent header 值
 * @returns TraceContext 或 null (如果格式无效)
 */
export function parseTraceparent(header: string): TraceContext | null {
  const parts = header.split('-')

  // 验证格式: version-trace_id-parent_id-trace_flags
  if (parts.length !== 4) {
    return null
  }

  const [version, traceId, spanId, traceFlags] = parts

  // 当前只支持 version 00
  if (version !== '00') {
    return null
  }

  // 验证 trace ID 长度 (32 hex chars)
  if (traceId.length !== 32 || !/^[0-9a-f]{32}$/.test(traceId)) {
    return null
  }

  // 验证 span ID 长度 (16 hex chars)
  if (spanId.length !== 16 || !/^[0-9a-f]{16}$/.test(spanId)) {
    return null
  }

  // 验证 trace flags (01 或 00)
  if (traceFlags !== '01' && traceFlags !== '00') {
    return null
  }

  return {
    traceId,
    spanId,
    traceFlags: traceFlags as '01' | '00',
  }
}

/**
 * 验证 trace context 是否有效
 */
export function isValidTraceContext(ctx: TraceContext): boolean {
  return (
    ctx.traceId.length === 32 &&
    /^[0-9a-f]{32}$/.test(ctx.traceId) &&
    ctx.spanId.length === 16 &&
    /^[0-9a-f]{16}$/.test(ctx.spanId) &&
    (ctx.traceFlags === '01' || ctx.traceFlags === '00')
  )
}
