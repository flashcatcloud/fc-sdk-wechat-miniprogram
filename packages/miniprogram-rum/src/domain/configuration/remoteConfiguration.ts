import { SDK_VERSION } from '@flashcatcloud/miniprogram-core'
import type { PlatformAdapter, RequestOptions } from '@flashcatcloud/miniprogram-platform'
import { markInternalRequest } from '@flashcatcloud/miniprogram-platform'
import type { RumConfiguration } from './configuration'

const CONFIG_PATH = '/api/v2/rum/config'
const CACHE_FORMAT_VERSION = 1
const REQUEST_TIMEOUT = 10_000

// How long past the platform's own timeout a request is still considered in flight. The timeout
// above is an option handed to the host, and nothing guarantees it answers at all: a request whose
// success and fail callbacks both go missing would otherwise hold the guard for the life of the
// process, and every later session renewal would be dropped without a sound. Expiring the guard by
// the clock costs no timer and needs no cancelling — the next session renewal simply asks again.
const IN_FLIGHT_MAX_MS = REQUEST_TIMEOUT + 5_000
const RETRY_DELAYS = [5_000, 60_000]

export const REMOTE_CONFIGURATION_STORAGE_KEY_PREFIX = '_fc_rum_remote_config_v1_'
const REMOTE_CONFIGURATION_INDEX_KEY_PREFIX = '_fc_rum_remote_config_index_v1_'

export interface SessionConfigurationSnapshot {
  sessionSampleRate: number
  rcVersion: number
  custom: Record<string, unknown> | null
}

interface CachedRemoteConfiguration {
  formatVersion: 1
  snapshot: SessionConfigurationSnapshot
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
      fetch: () => undefined,
      stop: () => undefined,
    }
  }

  const random = dependencies.random || Math.random
  const scheduleTimeout = dependencies.setTimeout || ((callback, delay) => setTimeout(callback, delay))
  const cancelTimeout = dependencies.clearTimeout || ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>))
  let currentSnapshot = initialSnapshot
  let etag: string | undefined
  let hasRemoteSnapshot = false
  let stopped = false
  // One chain at a time. Init and every session renewal ask for the configuration, and those two
  // can land together on a cold start, so without this the very first thing a launch does is send
  // the same request twice. Held as the moment it started rather than as a flag, so a chain whose
  // callbacks never arrive stops blocking the next trigger instead of blocking every one after it.
  let inFlightSince: number | undefined

  function inFlight(): boolean {
    return inFlightSince !== undefined && Date.now() - inFlightSince < IN_FLIGHT_MAX_MS
  }
  const retryTimers = new Set<unknown>()

  const endpoint = safelyCreateEndpoint(configuration)
  if (!endpoint) {
    return {
      getSessionConfiguration: () => currentSnapshot,
      getRemoteConfig: () => undefined,
      fetch: () => undefined,
      stop: () => {
        stopped = true
      },
    }
  }
  const activeEndpoint = endpoint

  const cacheKey = buildCacheKey(activeEndpoint.identity, configuration)
  const cacheIndexKey = buildCacheIndexKey(activeEndpoint.identity, configuration)
  registerCacheKey()
  readCache()

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
      currentSnapshot = normalizeSnapshot(parsed.snapshot)
      etag = parsed.etag
      hasRemoteSnapshot = true
    } catch {
      clearCache()
    }
  }

  function persist(snapshot: SessionConfigurationSnapshot, nextEtag?: string) {
    const cached: CachedRemoteConfiguration = {
      formatVersion: CACHE_FORMAT_VERSION,
      snapshot,
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

  /**
   * The kill switch. Every knob goes back to what the app was initialised with, but the version
   * that switched it off is kept: it is what the next request echoes as applied_version, and
   * without it the console's rollout view cannot tell a client that took the change from one that
   * never heard about it.
   */
  function resetToInitialization(version = 0) {
    currentSnapshot = { ...initialSnapshot, rcVersion: version }
    etag = undefined
    hasRemoteSnapshot = false
    // Written, not cleared. Every knob is already back at its initialization value, so there is
    // nothing stale to resurrect; what survives is the version that switched the channel off. A
    // miniprogram process is killed and restarted far more readily than an app, and a client that
    // dropped the version on restart would report none at all — indistinguishable, to the console,
    // from one that never heard about the change.
    persist(currentSnapshot)
  }

  function scheduleRetry(appliedVersion: number | undefined, retryIndex: number) {
    if (stopped || retryIndex >= RETRY_DELAYS.length) {
      // The chain is over: release the guard so the next session renewal can ask again.
      inFlightSince = undefined
      return
    }
    const jitter = 0.8 + random() * 0.4
    let timer: unknown
    try {
      timer = scheduleTimeout(() => {
        retryTimers.delete(timer)
        request(appliedVersion, retryIndex + 1)
      }, Math.round(RETRY_DELAYS[retryIndex] * jitter))
      retryTimers.add(timer)
    } catch {
      // Timer failures are isolated like request and storage failures. Nothing will call back, so
      // the chain ends here.
      inFlightSince = undefined
    }
  }

  /** The chain reached an answer it will not retry. */
  function finish() {
    inFlightSince = undefined
  }

  function request(appliedVersion: number | undefined, retryIndex: number) {
    if (stopped) {
      return
    }

    let settled = false
    const settle = (callback: () => void) => {
      if (settled || stopped) {
        return
      }
      settled = true
      try {
        callback()
      } catch {
        scheduleRetry(appliedVersion, retryIndex)
      }
    }

    let url: string
    try {
      url = activeEndpoint.build(appliedVersion)
    } catch {
      scheduleRetry(appliedVersion, retryIndex)
      return
    }

    const options = markInternalRequest<RequestOptions>({
      url,
      method: 'GET',
      timeout: REQUEST_TIMEOUT,
      ...(etag ? { header: { 'If-None-Match': etag } } : {}),
      success: (response) => settle(() => {
        const { statusCode } = response
        if (statusCode === 304) {
          if (hasRemoteSnapshot) {
            finish()
          } else {
            scheduleRetry(appliedVersion, retryIndex)
          }
          return
        }
        if (statusCode === 200) {
          const parsed = parseResponse(response.data, configuration.sessionSampleRate)
          if (!parsed) {
            scheduleRetry(appliedVersion, retryIndex)
            return
          }
          if (parsed.unsupportedSchema) {
            // A settled answer, not a failure: the server is describing the configuration in a
            // shape this build cannot read, and asking again only fetches the same refusal.
            finish()
            return
          }
          const nextEtag = findHeader(response.header, 'etag')
          if (configuration.debug) {
            try {
              console.log('[FlashCat RUM][Debug] Remote configuration fetched', {
                response: response.data,
                applied: parsed.enabled === false ? initialSnapshot : parsed.snapshot,
                etag: nextEtag,
              })
            } catch {
              // Console implementations are host code and must not affect config activation.
            }
          }
          if (parsed.enabled === false) {
            resetToInitialization(parsed.version)
            finish()
            return
          }
          currentSnapshot = parsed.snapshot
          etag = nextEtag
          hasRemoteSnapshot = true
          persist(parsed.snapshot, nextEtag)
          finish()
          return
        }
        if (statusCode === 0 || statusCode === 429 || statusCode >= 500) {
          scheduleRetry(appliedVersion, retryIndex)
          return
        }
        // Any other status is the server's settled answer — a 4xx will say the same thing next
        // time — so the values already in force stay and the chain ends here.
        finish()
      }),
      fail: () => settle(() => scheduleRetry(appliedVersion, retryIndex)),
    })

    try {
      adapter.request(options)
    } catch {
      settle(() => scheduleRetry(appliedVersion, retryIndex))
    }
  }

  return {
    getSessionConfiguration: () => ({
      ...currentSnapshot,
      custom: cloneCustom(currentSnapshot.custom),
    }),
    getRemoteConfig: () => {
      const custom = cloneCustom(currentSnapshot.custom)
      return custom || undefined
    },
    fetch: (appliedVersion) => {
      if (inFlight()) {
        return
      }
      inFlightSince = Date.now()
      try {
        request(appliedVersion, 0)
      } catch {
        // URL builders and platform adapters are host code and may throw.
        inFlightSince = undefined
      }
    },
    stop: () => {
      stopped = true
      inFlightSince = undefined
      retryTimers.forEach((timer) => {
        try {
          cancelTimeout(timer)
        } catch {
          // Ignore timer implementation failures.
        }
      })
      retryTimers.clear()
    },
  }
}

type ParsedResponse =
  /** The contract the body is written to is one this build cannot read; nothing is applied. */
  | { unsupportedSchema: true }
  /** The kill switch, carrying the version that set it so it can still be reported. */
  | { unsupportedSchema?: false; enabled: false; version: number }
  | { unsupportedSchema?: false; enabled: true; snapshot: SessionConfigurationSnapshot }

function parseResponse(data: unknown, initialSessionSampleRate: number): ParsedResponse | undefined {
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
  if ('schema_version' in value && value.schema_version !== 1) {
    // Told apart from an unreadable body on purpose: this one is a settled answer and retrying it
    // just fetches the same refusal, while a body we failed to read may well be a transient fault.
    return { unsupportedSchema: true }
  }
  if ('enabled' in value && typeof value.enabled !== 'boolean') {
    return undefined
  }
  if ('version' in value && !isRemoteVersion(value.version)) {
    return undefined
  }
  if (value.enabled === false) {
    return { enabled: false, version: isRemoteVersion(value.version) ? value.version : 0 }
  }
  if ('rum' in value && !isRecord(value.rum)) {
    return undefined
  }

  let sessionSampleRate = initialSessionSampleRate
  if (isRecord(value.rum) && 'sessionSampleRate' in value.rum) {
    if (!isSampleRate(value.rum.sessionSampleRate)) {
      return undefined
    }
    sessionSampleRate = value.rum.sessionSampleRate
  }

  const custom = isRecord(value.custom) ? cloneCustom(value.custom) : null

  return {
    enabled: true,
    snapshot: {
      sessionSampleRate,
      rcVersion: isRemoteVersion(value.version) ? value.version : 0,
      custom,
    },
  }
}

function isCachedRemoteConfiguration(value: unknown): value is CachedRemoteConfiguration {
  if (!isRecord(value) || value.formatVersion !== CACHE_FORMAT_VERSION || !isRecord(value.snapshot)) {
    return false
  }
  return (
    isSampleRate(value.snapshot.sessionSampleRate) &&
    isRemoteVersion(value.snapshot.rcVersion) &&
    (value.snapshot.custom === undefined || isRecord(value.snapshot.custom) || value.snapshot.custom === null) &&
    (value.etag === undefined || typeof value.etag === 'string')
  )
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSnapshot(snapshot: SessionConfigurationSnapshot): SessionConfigurationSnapshot {
  return {
    sessionSampleRate: snapshot.sessionSampleRate,
    rcVersion: snapshot.rcVersion,
    custom: isRecord(snapshot.custom) ? cloneCustom(snapshot.custom) : null,
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

function safelyCreateEndpoint(configuration: RumConfiguration): {
  identity: string
  build: (appliedVersion?: number) => string
} | undefined {
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
  const scope = JSON.stringify([
    endpointIdentity,
    configuration.applicationId,
    configuration.env || '',
  ])
  return `${REMOTE_CONFIGURATION_INDEX_KEY_PREFIX}${hash(scope)}`
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
