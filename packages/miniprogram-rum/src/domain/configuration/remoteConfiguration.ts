import { SDK_VERSION } from '@flashcatcloud/miniprogram-core'
import type { PlatformAdapter, RequestOptions } from '@flashcatcloud/miniprogram-platform'
import { markInternalRequest } from '@flashcatcloud/miniprogram-platform'
import type { RumConfiguration } from './configuration'

const CONFIG_PATH = '/api/v2/rum/config'
const CACHE_FORMAT_VERSION = 2
const REQUEST_TIMEOUT = 10_000
const RETRY_DELAYS = [5_000, 60_000]

export const REMOTE_CONFIGURATION_STORAGE_KEY_PREFIX = '_fc_rum_remote_config_v2_'
const REMOTE_CONFIGURATION_INDEX_KEY_PREFIX = '_fc_rum_remote_config_index_v2_'
const LEGACY_STORAGE_KEY_PREFIX = '_fc_rum_remote_config_v1_'
const LEGACY_INDEX_KEY_PREFIX = '_fc_rum_remote_config_index_v1_'

export interface SessionConfigurationSnapshot {
  sessionSampleRate: number
  rcVersion: number
  custom: Record<string, unknown> | null
}

interface RemoteConfigurationState {
  sessionSampleRate?: number
  rcVersion: number
  custom: Record<string, unknown> | null
}

interface CachedRemoteConfiguration extends RemoteConfigurationState {
  formatVersion: 2
  etag?: string
}

interface RemoteConfigurationDependencies {
  random?: () => number
  setTimeout?: (callback: () => void, delay: number) => unknown
  clearTimeout?: (timer: unknown) => void
}

export interface RemoteConfigurationController {
  getSessionConfiguration: () => SessionConfigurationSnapshot
  getRemoteConfig: () => Record<string, unknown> | undefined
  setSessionSampleRateChangeHandler: (handler: (previousRate: number, nextRate: number) => void) => void
  fetch: (appliedVersion?: number) => void
  stop: () => void
}

/**
 * Owns the complete remote configuration lifecycle. Every public operation is
 * exception-isolated so configuration delivery can never stop RUM collection.
 */
export function createRemoteConfigurationController(
  adapter: PlatformAdapter,
  configuration: RumConfiguration,
  dependencies: RemoteConfigurationDependencies = {},
): RemoteConfigurationController {
  const initialSnapshot: SessionConfigurationSnapshot = {
    sessionSampleRate: configuration.sessionSampleRate,
    rcVersion: 0,
    custom: null,
  }

  if (!configuration.remoteConfigurationEnabled) {
    return {
      getSessionConfiguration: () => initialSnapshot,
      getRemoteConfig: () => undefined,
      setSessionSampleRateChangeHandler: () => undefined,
      fetch: () => undefined,
      stop: () => undefined,
    }
  }

  const random = dependencies.random || Math.random
  const scheduleTimeout = dependencies.setTimeout || ((callback, delay) => setTimeout(callback, delay))
  const cancelTimeout = dependencies.clearTimeout || ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>))
  let currentState: RemoteConfigurationState = { rcVersion: 0, custom: null }
  let etag: string | undefined
  let hasRemoteConfiguration = false
  let highestKnownVersion = 0
  let stopped = false
  let sampleRateChangeHandler: ((previousRate: number, nextRate: number) => void) | undefined
  let activeChainId: number | undefined
  let nextChainId = 0
  let retryTimer: unknown

  const endpoint = safelyCreateEndpoint(configuration)
  if (!endpoint) {
    return {
      getSessionConfiguration: getEffectiveSnapshot,
      getRemoteConfig: () => undefined,
      setSessionSampleRateChangeHandler: () => undefined,
      fetch: () => undefined,
      stop: () => {
        stopped = true
      },
    }
  }
  const activeEndpoint = endpoint

  const cacheKey = buildCacheKey(activeEndpoint.identity, configuration)
  const cacheIndexKey = buildCacheIndexKey(activeEndpoint.identity, configuration)
  const legacyCacheKey = buildLegacyCacheKey(activeEndpoint.identity, configuration)
  const legacyCacheIndexKey = buildLegacyCacheIndexKey(activeEndpoint.identity, configuration)
  registerCacheKey()
  readCache()

  function getEffectiveSnapshot(): SessionConfigurationSnapshot {
    return {
      sessionSampleRate: currentState.sessionSampleRate ?? configuration.sessionSampleRate,
      rcVersion: currentState.rcVersion,
      custom: cloneCustom(currentState.custom),
    }
  }

  function debugLog(message: string, details?: Record<string, unknown>) {
    if (!configuration.debug) {
      return
    }
    try {
      console.log(`[FlashCat RUM][Debug] ${message}`, details || {})
    } catch {
      // Console implementations are host code and must not affect configuration delivery.
    }
  }

  function registerCacheKey() {
    try {
      const previousCacheKey = adapter.getStorageSync(cacheIndexKey)
      if (
        typeof previousCacheKey === 'string' &&
        previousCacheKey !== cacheKey &&
        previousCacheKey.startsWith(REMOTE_CONFIGURATION_STORAGE_KEY_PREFIX)
      ) {
        adapter.removeStorageSync(previousCacheKey)
      }
      const previousLegacyCacheKey = adapter.getStorageSync(legacyCacheIndexKey)
      if (typeof previousLegacyCacheKey === 'string' && previousLegacyCacheKey.startsWith(LEGACY_STORAGE_KEY_PREFIX)) {
        adapter.removeStorageSync(previousLegacyCacheKey)
      }
      // V1 stored the effective initialization rate as if it were a remote override. Reusing it
      // could freeze an old initialization value across app builds, so it is intentionally dropped.
      adapter.removeStorageSync(legacyCacheKey)
      adapter.removeStorageSync(legacyCacheIndexKey)
      adapter.setStorageSync(cacheIndexKey, cacheKey)
    } catch {
      // Cache cleanup is best effort and must not affect configuration loading.
    }
  }

  function clearCache() {
    try {
      adapter.removeStorageSync(cacheKey)
    } catch {
      // Storage is an optimization only.
    }
  }

  function readCache() {
    try {
      const stored = adapter.getStorageSync(cacheKey)
      if (stored === undefined || stored === null || stored === '') {
        return
      }
      const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored
      if (!isCachedRemoteConfiguration(parsed)) {
        clearCache()
        return
      }
      currentState = normalizeRemoteState(parsed)
      etag = parsed.etag
      hasRemoteConfiguration = true
      highestKnownVersion = currentState.rcVersion
    } catch {
      clearCache()
    }
  }

  function persist(state: RemoteConfigurationState, nextEtag?: string) {
    const cached: CachedRemoteConfiguration = {
      formatVersion: CACHE_FORMAT_VERSION,
      ...state,
      ...(nextEtag ? { etag: nextEtag } : {}),
    }
    try {
      // Snapshot and ETag are written together so readers never observe a
      // configuration paired with an ETag from another response.
      adapter.setStorageSync(cacheKey, JSON.stringify(cached))
    } catch {
      // The in-memory snapshot remains active even if persistence fails.
    }
  }

  function applyConfiguration(parsed: ParsedConfiguration, nextEtag: string | undefined, rawResponse: unknown) {
    const previousRate = getEffectiveSnapshot().sessionSampleRate
    currentState = {
      ...(parsed.enabled && parsed.sessionSampleRate !== undefined
        ? { sessionSampleRate: parsed.sessionSampleRate }
        : {}),
      rcVersion: parsed.version,
      custom: parsed.enabled ? parsed.custom : null,
    }
    etag = nextEtag
    hasRemoteConfiguration = true
    highestKnownVersion = Math.max(highestKnownVersion, parsed.version)
    persist(currentState, nextEtag)

    const nextSnapshot = getEffectiveSnapshot()
    debugLog('Remote configuration fetched', {
      response: rawResponse,
      applied: nextSnapshot,
      etag: nextEtag,
    })

    if ((previousRate === 0) !== (nextSnapshot.sessionSampleRate === 0)) {
      debugLog('Remote session sample rate crossed zero', {
        previousRate,
        nextRate: nextSnapshot.sessionSampleRate,
        version: parsed.version,
      })
      try {
        sampleRateChangeHandler?.(previousRate, nextSnapshot.sessionSampleRate)
      } catch {
        // Host/session lifecycle failures must not invalidate an accepted configuration.
      }
    }
  }

  function isActiveChain(chainId: number) {
    return !stopped && activeChainId === chainId
  }

  function finishChain(chainId: number) {
    if (activeChainId === chainId) {
      activeChainId = undefined
    }
  }

  function scheduleRetry(chainId: number, appliedVersion: number | undefined, retryIndex: number, reason: string) {
    if (!isActiveChain(chainId) || retryIndex >= RETRY_DELAYS.length) {
      finishChain(chainId)
      return
    }
    const jitter = 0.8 + random() * 0.4
    const delay = Math.round(RETRY_DELAYS[retryIndex] * jitter)
    debugLog('Remote configuration retry scheduled', {
      reason,
      delay,
      attempt: retryIndex + 2,
    })
    let timer: unknown
    try {
      timer = scheduleTimeout(() => {
        if (retryTimer === timer) {
          retryTimer = undefined
        }
        if (isActiveChain(chainId)) {
          request(chainId, appliedVersion, retryIndex + 1)
        }
      }, delay)
      retryTimer = timer
    } catch {
      finishChain(chainId)
    }
  }

  function request(chainId: number, appliedVersion: number | undefined, retryIndex: number) {
    if (!isActiveChain(chainId)) {
      return
    }

    let settled = false
    const settle = (callback: () => void) => {
      if (settled || !isActiveChain(chainId)) {
        return
      }
      settled = true
      try {
        callback()
      } catch {
        scheduleRetry(chainId, appliedVersion, retryIndex, 'callback_error')
      }
    }

    let url: string
    try {
      url = activeEndpoint.build(appliedVersion)
    } catch {
      scheduleRetry(chainId, appliedVersion, retryIndex, 'endpoint_error')
      return
    }

    const options = markInternalRequest<RequestOptions>({
      url,
      method: 'GET',
      timeout: REQUEST_TIMEOUT,
      ...(etag ? { header: { 'If-None-Match': etag } } : {}),
      success: (response) =>
        settle(() => {
          const { statusCode } = response
          if (statusCode === 304) {
            if (hasRemoteConfiguration) {
              finishChain(chainId)
            } else {
              scheduleRetry(chainId, appliedVersion, retryIndex, '304_without_snapshot')
            }
            return
          }
          if (statusCode === 200) {
            const parsed = parseResponse(response.data)
            if (!parsed) {
              debugLog('Remote configuration response rejected', { reason: 'invalid_payload' })
              scheduleRetry(chainId, appliedVersion, retryIndex, 'invalid_payload')
              return
            }
            if (parsed.kind === 'unsupported_schema') {
              debugLog('Remote configuration response rejected', { reason: 'unsupported_schema' })
              finishChain(chainId)
              return
            }
            if (parsed.version < highestKnownVersion) {
              debugLog('Stale remote configuration ignored', {
                responseVersion: parsed.version,
                highestKnownVersion,
              })
              finishChain(chainId)
              return
            }
            const nextEtag = findHeader(response.header, 'etag')
            applyConfiguration(parsed, nextEtag, response.data)
            finishChain(chainId)
            return
          }
          debugLog('Remote configuration request failed', { statusCode })
          if (statusCode === 0 || statusCode === 429 || statusCode >= 500) {
            scheduleRetry(chainId, appliedVersion, retryIndex, `http_${statusCode}`)
            return
          }
          finishChain(chainId)
        }),
      fail: () =>
        settle(() => {
          debugLog('Remote configuration request failed', { reason: 'network_error' })
          scheduleRetry(chainId, appliedVersion, retryIndex, 'network_error')
        }),
      complete: () =>
        settle(() => {
          debugLog('Remote configuration request failed', { reason: 'missing_result_callback' })
          scheduleRetry(chainId, appliedVersion, retryIndex, 'missing_result_callback')
        }),
    })

    try {
      adapter.request(options)
    } catch {
      settle(() => {
        debugLog('Remote configuration request failed', { reason: 'request_error' })
        scheduleRetry(chainId, appliedVersion, retryIndex, 'request_error')
      })
    }
  }

  return {
    getSessionConfiguration: getEffectiveSnapshot,
    getRemoteConfig: () => {
      const custom = cloneCustom(currentState.custom)
      return custom || undefined
    },
    setSessionSampleRateChangeHandler: (handler) => {
      sampleRateChangeHandler = handler
    },
    fetch: (appliedVersion) => {
      if (isRemoteVersion(appliedVersion)) {
        highestKnownVersion = Math.max(highestKnownVersion, appliedVersion)
      }
      if (activeChainId !== undefined || stopped) {
        return
      }
      const chainId = ++nextChainId
      activeChainId = chainId
      try {
        request(chainId, appliedVersion, 0)
      } catch {
        finishChain(chainId)
      }
    },
    stop: () => {
      stopped = true
      activeChainId = undefined
      if (retryTimer !== undefined) {
        try {
          cancelTimeout(retryTimer)
        } catch {
          // Ignore timer implementation failures.
        }
        retryTimer = undefined
      }
    },
  }
}

type ParsedResponse = { kind: 'unsupported_schema' } | ParsedConfiguration

interface ParsedConfiguration {
  kind: 'configuration'
  enabled: boolean
  version: number
  sessionSampleRate?: number
  custom: Record<string, unknown> | null
}

function parseResponse(data: unknown): ParsedResponse | undefined {
  let value: unknown = data
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return undefined
    }
  }
  if (!isRecord(value)) {
    return undefined
  }
  if (value.schema_version !== 1) {
    return 'schema_version' in value ? { kind: 'unsupported_schema' } : undefined
  }
  if (typeof value.enabled !== 'boolean' || !isRemoteVersion(value.version)) {
    return undefined
  }
  if ('rum' in value && !isRecord(value.rum)) {
    return undefined
  }

  let sessionSampleRate: number | undefined
  if (isRecord(value.rum) && 'sessionSampleRate' in value.rum) {
    if (!isSampleRate(value.rum.sessionSampleRate)) {
      return undefined
    }
    sessionSampleRate = value.rum.sessionSampleRate
  }

  const custom = isRecord(value.custom) ? cloneCustom(value.custom) : null

  return {
    kind: 'configuration',
    enabled: value.enabled,
    version: value.version,
    sessionSampleRate,
    custom,
  }
}

function isCachedRemoteConfiguration(value: unknown): value is CachedRemoteConfiguration {
  if (!isRecord(value) || value.formatVersion !== CACHE_FORMAT_VERSION) {
    return false
  }
  return (
    (value.sessionSampleRate === undefined || isSampleRate(value.sessionSampleRate)) &&
    isRemoteVersion(value.rcVersion) &&
    (value.custom === undefined || isRecord(value.custom) || value.custom === null) &&
    (value.etag === undefined || typeof value.etag === 'string')
  )
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeRemoteState(state: CachedRemoteConfiguration): RemoteConfigurationState {
  return {
    ...(state.sessionSampleRate !== undefined ? { sessionSampleRate: state.sessionSampleRate } : {}),
    rcVersion: state.rcVersion,
    custom: isRecord(state.custom) ? cloneCustom(state.custom) : null,
  }
}

function cloneCustom(custom: Record<string, unknown> | null): Record<string, unknown> | null {
  if (custom === null) {
    return null
  }
  try {
    const cloned = JSON.parse(JSON.stringify(custom))
    return isRecord(cloned) ? cloned : null
  } catch {
    return null
  }
}

function isSampleRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

function isRemoteVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

function findHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined
  }
  const matchedName = Object.keys(headers).find((header) => header.toLowerCase() === name.toLowerCase())
  return matchedName ? headers[matchedName] : undefined
}

function safelyCreateEndpoint(configuration: RumConfiguration):
  | {
      identity: string
      build: (appliedVersion?: number) => string
    }
  | undefined {
  try {
    const { proxy, site } = configuration.remoteConfigurationSource
    let identity: string
    if (typeof proxy === 'string') {
      identity = `proxy:${normalizeUrl(proxy)}`
    } else if (typeof proxy === 'function') {
      const resolved = proxy({ path: CONFIG_PATH, parameters: '' })
      if (typeof resolved !== 'string' || !resolved) {
        return undefined
      }
      identity = `proxy-function:${removeUrlParameters(resolved)}`
    } else {
      identity = `site:${site || 'browser.flashcat.cloud'}`
    }

    return {
      identity,
      build: (appliedVersion) => {
        const parameters = buildParameters(configuration, appliedVersion)
        if (typeof proxy === 'string') {
          return `${normalizeUrl(proxy)}?ddforward=${encodeURIComponent(`${CONFIG_PATH}?${parameters}`)}`
        }
        if (typeof proxy === 'function') {
          return proxy({ path: CONFIG_PATH, parameters })
        }
        return `https://${site || 'browser.flashcat.cloud'}${CONFIG_PATH}?${parameters}`
      },
    }
  } catch {
    return undefined
  }
}

function buildParameters(configuration: RumConfiguration, appliedVersion?: number): string {
  const parameters = [
    `client_token=${encodeURIComponent(configuration.clientToken)}`,
    'sdk=miniprogram',
    `sdk_version=${encodeURIComponent(SDK_VERSION)}`,
    `env=${encodeURIComponent(configuration.env || '')}`,
    `app_version=${encodeURIComponent(configuration.version || '')}`,
  ]
  if (isRemoteVersion(appliedVersion) && appliedVersion > 0) {
    parameters.push(`applied_version=${appliedVersion}`)
  }
  return parameters.join('&')
}

function buildCacheKey(endpointIdentity: string, configuration: RumConfiguration): string {
  const dimensions = JSON.stringify([
    endpointIdentity,
    configuration.applicationId,
    configuration.env || '',
    configuration.version || '',
  ])
  return `${REMOTE_CONFIGURATION_STORAGE_KEY_PREFIX}${hash(dimensions)}`
}

function buildCacheIndexKey(endpointIdentity: string, configuration: RumConfiguration): string {
  const scope = JSON.stringify([endpointIdentity, configuration.applicationId, configuration.env || ''])
  return `${REMOTE_CONFIGURATION_INDEX_KEY_PREFIX}${hash(scope)}`
}

function buildLegacyCacheKey(endpointIdentity: string, configuration: RumConfiguration): string {
  const dimensions = JSON.stringify([
    endpointIdentity,
    configuration.applicationId,
    configuration.env || '',
    configuration.version || '',
  ])
  return `${LEGACY_STORAGE_KEY_PREFIX}${hash(dimensions)}`
}

function buildLegacyCacheIndexKey(endpointIdentity: string, configuration: RumConfiguration): string {
  const scope = JSON.stringify([endpointIdentity, configuration.applicationId, configuration.env || ''])
  return `${LEGACY_INDEX_KEY_PREFIX}${hash(scope)}`
}

function hash(value: string): string {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function removeUrlParameters(url: string): string {
  const separatorIndex = url.search(/[?#]/)
  return normalizeUrl(separatorIndex === -1 ? url : url.slice(0, separatorIndex))
}
