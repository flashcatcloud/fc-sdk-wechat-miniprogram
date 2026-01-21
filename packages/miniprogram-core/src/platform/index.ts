import type { PlatformAdapter } from './types'
import { wechatAdapter } from './wechat'

export function getDefaultAdapter(): PlatformAdapter {
  return wechatAdapter
}

export type { PlatformAdapter } from './types'
export type { RequestOptions, RequestTask, StorageOptions } from './types'
