import type { EndpointBuilder } from "./endpointBuilder";
import { createEndpointBuilder } from "./endpointBuilder";

export interface InitConfiguration {
  clientToken: string;
  applicationId: string;
  /**
   * 数据上报地址（完整 URL）
   * 如果设置了 site，此参数可选
   * 例如：'https://custom.example.com/api/v2/rum'
   */
  endpoint?: string;
  /**
   * FlashCat 站点域名
   * 例如：'browser.flashcat.cloud'
   * 默认：'browser.flashcat.cloud'
   * SDK 会自动拼接为：https://{site}/api/v2/rum
   */
  site?: string;
  sessionSampleRate?: number;
  flushInterval?: number;
  beforeSend?: (event: unknown) => boolean | void;
  service?: string;
  env?: string;
  version?: string;
  debug?: boolean; // 是否开启调试模式
}

export interface Configuration {
  clientToken: string;
  applicationId: string;
  endpointBuilder: EndpointBuilder;
  sessionSampleRate: number;
  flushInterval: number;
  beforeSend?: (event: unknown) => boolean | void;
  service?: string;
  env?: string;
  version?: string;
  debug: boolean;
}

export function validateAndBuildConfiguration(
  initConfiguration: InitConfiguration
): Configuration | undefined {
  if (!initConfiguration.clientToken || !initConfiguration.applicationId) {
    console.error('[FlashCat RUM] 初始化失败：缺少必填配置项 clientToken 或 applicationId');
    return;
  }

  // 构建 endpoint：优先使用 endpoint，否则从 site 构建
  let endpoint: string;
  if (initConfiguration.endpoint) {
    endpoint = initConfiguration.endpoint;
  } else {
    const site = initConfiguration.site || 'browser.flashcat.cloud';
    endpoint = `https://${site}/api/v2/rum`;
  }

  const sessionSampleRate = initConfiguration.sessionSampleRate ?? 100;
  const flushInterval = initConfiguration.flushInterval ?? 15000;
  const debug = initConfiguration.debug ?? false;
  
  const config: Configuration = {
    clientToken: initConfiguration.clientToken,
    applicationId: initConfiguration.applicationId,
    endpointBuilder: createEndpointBuilder(endpoint, "rum"),
    sessionSampleRate,
    flushInterval,
    beforeSend: initConfiguration.beforeSend,
    service: initConfiguration.service,
    env: initConfiguration.env,
    version: initConfiguration.version,
    debug,
  };

  if (debug) {
    console.log('[FlashCat RUM] ✅ 初始化成功', {
      applicationId: config.applicationId,
      配置方式: initConfiguration.endpoint ? 'endpoint' : 'site',
      site: initConfiguration.site,
      endpoint: endpoint,
      上报地址: config.endpointBuilder.build({}),
      service: config.service,
      env: config.env,
      version: config.version,
      sessionSampleRate: config.sessionSampleRate,
      flushInterval: `${config.flushInterval}ms`,
    });
  }

  return config;
}
