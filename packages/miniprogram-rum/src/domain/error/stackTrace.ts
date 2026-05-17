export interface StackFrame {
  func: string
  url: string
  line?: number
  column?: number
}

export interface StackTrace {
  name: string
  message: string
  stack: StackFrame[]
}

const UNKNOWN_FUNCTION = '<anonymous>'
const DEFAULT_ERROR_NAME = 'Error'

const ERROR_HEADER_RE = /^([A-Za-z_$][\w$]*(?:Error|Exception)?|Error):\s*([\s\S]*)$/
const NORMALIZED_RE = /^\s*at\s+(.*?)\s+@\s+(.+?)(?::(\d+))?(?::(\d+))?\s*$/
const CHROME_RE = /^\s*at\s+(.*?)\s+\((.+):(\d+):(\d+)\)\s*$/
const CHROME_ANONYMOUS_RE = /^\s*at\s+(.+):(\d+):(\d+)\s*$/
const GECKO_RE = /^\s*(.*?)@(.+):(\d+):(\d+)\s*$/
const QUERY_RE = /\?[^)\s]*/
const DEVTOOLS_APPSERVICE_RE = /^https?:\/\/127\.0\.0\.1:\d+\/appservice\//
const REAL_DEVICE_USR_RE = /^https?:\/\/usr\/+/

export function computeStackTraceFromStackString(
  stack: string | undefined,
  fallbackName = DEFAULT_ERROR_NAME,
  fallbackMessage = 'Unknown error',
): StackTrace | undefined {
  if (!stack) {
    return undefined
  }

  const lines = stack.split('\n')
  let name = fallbackName || DEFAULT_ERROR_NAME
  let message = fallbackMessage || 'Unknown error'
  let frameStart = 0
  const firstLine = lines[0]?.trim() || ''

  if (!parseFrame(firstLine)) {
    const header = ERROR_HEADER_RE.exec(firstLine)
    if (header) {
      name = header[1].trim() || name
      message = header[2].trim() || message
      frameStart = 1
    }
  }

  const frames: StackFrame[] = []
  for (let i = frameStart; i < lines.length; i += 1) {
    const frame = parseFrame(lines[i])
    if (frame) {
      frames.push(frame)
    }
  }

  if (frames.length === 0) {
    return undefined
  }

  return { name, message, stack: frames }
}

export function toStackTraceString(stackTrace: StackTrace) {
  let result = `${stackTrace.name || DEFAULT_ERROR_NAME}: ${stackTrace.message || 'Unknown error'}`
  for (const frame of stackTrace.stack) {
    const line = frame.line ? `:${frame.line}` : ''
    const column = frame.line && frame.column ? `:${frame.column}` : ''
    result += `\n  at ${frame.func || UNKNOWN_FUNCTION} @ ${frame.url}${line}${column}`
  }
  return result
}

function parseFrame(line: string): StackFrame | undefined {
  const trimmed = line.trim()
  if (!trimmed || trimmed === '[native code]' || trimmed === '@[native code]' || trimmed === 'at [native code]' || trimmed.endsWith(' code@')) {
    return undefined
  }

  let match = NORMALIZED_RE.exec(trimmed)
  if (match) {
    return buildFrame(match[1], match[2], match[3], match[4])
  }

  match = CHROME_RE.exec(trimmed)
  if (match) {
    return buildFrame(match[1], match[2], match[3], match[4])
  }

  match = CHROME_ANONYMOUS_RE.exec(trimmed)
  if (match) {
    return buildFrame(UNKNOWN_FUNCTION, match[1], match[2], match[3])
  }

  match = GECKO_RE.exec(trimmed)
  if (match) {
    return buildFrame(match[1] || UNKNOWN_FUNCTION, match[2], match[3], match[4])
  }

  return undefined
}

function buildFrame(func: string, url: string, line?: string, column?: string): StackFrame {
  return {
    func: func.trim() || UNKNOWN_FUNCTION,
    url: normalizeFrameUrl(url),
    line: line ? Number(line) : undefined,
    column: column ? Number(column) : undefined,
  }
}

function normalizeFrameUrl(url: string) {
  return url
    .trim()
    .replace(QUERY_RE, '')
    .replace(/^weapp:\/\/\/?/, '')
    .replace(DEVTOOLS_APPSERVICE_RE, '')
    .replace(REAL_DEVICE_USR_RE, '')
}
