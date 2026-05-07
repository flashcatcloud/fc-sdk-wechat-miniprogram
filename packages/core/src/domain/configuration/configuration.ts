import type { EndpointBuilder, ProxyFn } from './endpointBuilder'
import { createEndpointBuilder } from './endpointBuilder'
import { buildTags } from './tags'

export interface InitConfiguration {
  clientToken: string
  applicationId: string
  /**
   * 可选的代理地址，支持字符串或函数
   * - 字符串：'https://proxy.example.com/path'
   *   SDK 会拼接为：{proxy}?ddforward={encodedPath}
   * - 函数：(options: { path: string; parameters: string }) => string
   *   SDK 会传入 path 和 parameters，由函数自行拼接完整 URL
   */
  proxy?: string | ProxyFn
  /**
   * FlashCat 站点域名
   * 例如：'browser.flashcat.cloud'
   * 默认：'browser.flashcat.cloud'
   * SDK 会自动拼接为：https://{site}/api/v2/rum
   */
  site?: string
  sessionSampleRate?: number
  flushInterval?: number
  beforeSend?: (event: unknown) => boolean | void
  service?: string
  env?: string
  version?: string
  debug?: boolean // 是否开启调试模式
  trackAnonymousUser?: boolean
}

export interface Configuration {
  clientToken: string
  applicationId: string
  endpointBuilder: EndpointBuilder
  sessionSampleRate: number
  flushInterval: number
  beforeSend?: (event: unknown) => boolean | void
  service?: string
  env?: string
  version?: string
  debug: boolean
  trackAnonymousUser: boolean
}

export function validateAndBuildConfiguration(initConfiguration: InitConfiguration): Configuration | undefined {
  if (!initConfiguration.clientToken || !initConfiguration.applicationId) {
    console.error('[FlashCat RUM] Init failed: missing required config clientToken or applicationId')
    return
  }

  const sessionSampleRate = initConfiguration.sessionSampleRate ?? 100
  const flushInterval = initConfiguration.flushInterval ?? 15000
  const debug = initConfiguration.debug ?? false
  const trackAnonymousUser = initConfiguration.trackAnonymousUser ?? true

  const configurationTags = buildTags(initConfiguration)
  const endpointBuilder = createEndpointBuilder(initConfiguration, 'rum', configurationTags)

  const config: Configuration = {
    clientToken: initConfiguration.clientToken,
    applicationId: initConfiguration.applicationId,
    endpointBuilder,
    sessionSampleRate,
    flushInterval,
    beforeSend: initConfiguration.beforeSend,
    service: initConfiguration.service,
    env: initConfiguration.env,
    version: initConfiguration.version,
    debug,
    trackAnonymousUser,
  }

  if (debug) {
    console.log('[FlashCat RUM] Initialized successfully', {
      applicationId: config.applicationId,
      endpointType: initConfiguration.proxy ? 'proxy' : 'site',
      site: initConfiguration.site || 'browser.flashcat.cloud',
      proxy: initConfiguration.proxy,
      intakeUrl: endpointBuilder.urlPrefix,
      service: config.service,
      env: config.env,
      version: config.version,
      sessionSampleRate: config.sessionSampleRate,
      flushInterval: `${config.flushInterval}ms`,
      trackAnonymousUser: config.trackAnonymousUser,
    })
  }

  return config
}
