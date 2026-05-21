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
   * 64-bit trace ID (decimal string)
   * 与 Browser SDK 保持一致，用于 RUM 事件中的 _dd.trace_id
   */
  traceId: string

  /**
   * 63-bit span ID (decimal string)
   * 与 Browser SDK 保持一致，用于 RUM 事件中的 _dd.span_id
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
 * 生成随机 32-bit 整数。优先使用 Web Crypto，降级到 Math.random 以兼容小程序环境。
 */
function randomUint32(): number {
  const crypto = globalThis.crypto
  if (crypto?.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0]
  }

  return Math.floor(Math.random() * 0x100000000)
}

function createIdentifier(bits: 63 | 64): string {
  const buffer = [randomUint32(), randomUint32()]
  if (bits === 63) {
    // eslint-disable-next-line no-bitwise
    buffer[buffer.length - 1] >>>= 1
  }

  if (buffer[0] === 0 && buffer[1] === 0) {
    buffer[0] = 1
  }

  return uint32PairToString(buffer[0], buffer[1], 10)
}

function uint32PairToString(lowBits: number, highBits: number, radix: number): string {
  let high = highBits
  let low = lowBits
  let str = ''

  do {
    const mod = (high % radix) * 4294967296 + low
    high = Math.floor(high / radix)
    low = Math.floor(mod / radix)
    str = (mod % radix).toString(radix) + str
  } while (high || low)

  return str
}

function decimalToPaddedHexadecimalString(decimal: string): string {
  return decimalToHexadecimalString(decimal).padStart(16, '0')
}

function decimalToHexadecimalString(decimal: string): string {
  let value = decimal
  let result = ''

  do {
    let remainder = 0
    let quotient = ''

    for (let i = 0; i < value.length; i++) {
      const current = remainder * 10 + value.charCodeAt(i) - 48
      const digit = Math.floor(current / 16)
      remainder = current % 16
      if (quotient || digit) {
        quotient += digit.toString()
      }
    }

    result = remainder.toString(16) + result
    value = quotient || '0'
  } while (value !== '0')

  return result
}

function hexadecimalToDecimalString(hexadecimal: string): string {
  let result = '0'

  for (let i = 0; i < hexadecimal.length; i++) {
    result = multiplyDecimalString(result, 16)
    result = addDecimalString(result, parseInt(hexadecimal[i], 16))
  }

  return result
}

function multiplyDecimalString(decimal: string, multiplier: number): string {
  let carry = 0
  let result = ''

  for (let i = decimal.length - 1; i >= 0; i--) {
    const value = (decimal.charCodeAt(i) - 48) * multiplier + carry
    result = (value % 10).toString() + result
    carry = Math.floor(value / 10)
  }

  while (carry > 0) {
    result = (carry % 10).toString() + result
    carry = Math.floor(carry / 10)
  }

  return result.replace(/^0+(?=\d)/, '')
}

function addDecimalString(decimal: string, addend: number): string {
  let carry = addend
  let result = ''

  for (let i = decimal.length - 1; i >= 0; i--) {
    const value = decimal.charCodeAt(i) - 48 + carry
    result = (value % 10).toString() + result
    carry = Math.floor(value / 10)
  }

  while (carry > 0) {
    result = (carry % 10).toString() + result
    carry = Math.floor(carry / 10)
  }

  return result.replace(/^0+(?=\d)/, '')
}

/**
 * 生成 Browser SDK 兼容的 64-bit trace ID (十进制字符串)
 */
export function generateTraceId(): string {
  return createIdentifier(64)
}

/**
 * 生成 Browser SDK 兼容的 63-bit span ID (十进制字符串)
 */
export function generateSpanId(): string {
  return createIdentifier(63)
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
  const traceId = `0000000000000000${decimalToPaddedHexadecimalString(ctx.traceId)}`
  const spanId = decimalToPaddedHexadecimalString(ctx.spanId)
  return `00-${traceId}-${spanId}-${ctx.traceFlags}`
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
    traceId: hexadecimalToDecimalString(traceId.slice(16)),
    spanId: hexadecimalToDecimalString(spanId),
    traceFlags: traceFlags as '01' | '00',
  }
}

/**
 * 验证 trace context 是否有效
 */
export function isValidTraceContext(ctx: TraceContext): boolean {
  return (
    isValidDecimalIdentifier(ctx.traceId) &&
    isValidDecimalIdentifier(ctx.spanId) &&
    (ctx.traceFlags === '01' || ctx.traceFlags === '00')
  )
}

function isValidDecimalIdentifier(identifier: string): boolean {
  return /^[1-9]\d*$/.test(identifier)
}
