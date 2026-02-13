import { generateUUID } from "../../tools/utils/stringUtils";
import { now } from "../../tools/utils/timeUtils";
import { SDK_VERSION } from "./sdkVersion";

export type TrackType = "rum";

/**
 * proxy 为函数类型时的签名
 * path: /api/v2/rum
 * parameters: encoding=xxx&...
 */
export type ProxyFn = (options: { path: string; parameters: string }) => string;

export interface EndpointBuilder {
  trackType: TrackType;
  build: (payload: { encoding?: string }) => string;
  urlPrefix: string;
  tags: string[];
}

export function createEndpointBuilder(
  initConfiguration: {
    clientToken: string;
    proxy?: string | ProxyFn;
    site?: string;
  },
  trackType: TrackType,
  configurationTags: string[]
): EndpointBuilder {
  const buildUrlWithParameters = createEndpointUrlWithParametersBuilder(
    initConfiguration,
    trackType
  );

  return {
    trackType,
    build: (payload) => {
      const parameters = buildEndpointParameters(
        initConfiguration,
        trackType,
        configurationTags,
        payload
      );
      return buildUrlWithParameters(parameters);
    },
    urlPrefix: buildUrlWithParameters(""),
    tags: configurationTags,
  };
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * 预计算 URL 构建函数，与 browser-sdk 对齐：
 * - 有 proxy 时：{proxy}?ddforward={encoded path + params}
 * - 无 proxy 时：https://{site}/api/v2/{trackType}?{params}
 */
function createEndpointUrlWithParametersBuilder(
  initConfiguration: { proxy?: string | ProxyFn; site?: string },
  trackType: TrackType
): (parameters: string) => string {
  const path = `/api/v2/${trackType}`;
  const proxy = initConfiguration.proxy;

  if (typeof proxy === "string") {
    const normalizedProxyUrl = normalizeUrl(proxy);
    return (parameters) => {
      const forward = parameters ? `${path}?${parameters}` : path;
      return `${normalizedProxyUrl}?ddforward=${encodeURIComponent(forward)}`;
    };
  }

  if (typeof proxy === "function") {
    return (parameters) => proxy({ path, parameters });
  }

  const site = initConfiguration.site || "browser.flashcat.cloud";
  return (parameters) => {
    const base = `https://${site}${path}`;
    return parameters ? `${base}?${parameters}` : base;
  };
}

/**
 * 构建上报请求的 URL 参数，与 browser-sdk 对齐
 * 每次请求都会重新构建（因为 dd-request-id 等字段每次不同）
 */
function buildEndpointParameters(
  { clientToken }: { clientToken: string },
  trackType: TrackType,
  configurationTags: string[],
  { encoding }: { encoding?: string }
): string {
  const tags = [
    `sdk_version:${SDK_VERSION}`,
    `api:miniapp`,
  ].concat(configurationTags);

  const parameters = [
    "ddsource=miniapp",
    `ddtags=${encodeURIComponent(tags.join(","))}`,
    `dd-api-key=${clientToken}`,
    `dd-evp-origin-version=${encodeURIComponent(SDK_VERSION)}`,
    "dd-evp-origin=miniapp",
    `dd-request-id=${generateUUID()}`,
  ];

  if (encoding) {
    parameters.push(`dd-evp-encoding=${encoding}`);
  }

  if (trackType === "rum") {
    parameters.push(`batch_time=${now()}`);
  }

  return parameters.join("&");
}
