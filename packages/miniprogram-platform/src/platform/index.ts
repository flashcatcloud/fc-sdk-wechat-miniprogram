import type { PlatformAdapter } from './types'
import { wechatAdapter } from './wechat/index'

export function getDefaultAdapter(): PlatformAdapter {
  return wechatAdapter
}

export type { PlatformAdapter } from './types'
export type { RequestOptions, RequestTask, StorageOptions } from './types'
export { markInternalRequest } from './internalRequest'
