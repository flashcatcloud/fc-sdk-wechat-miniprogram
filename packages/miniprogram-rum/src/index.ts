import { makeRumPublicApi } from './boot/rumPublicApi'

// 创建默认单例实例
export const flashcatRum = makeRumPublicApi()

// 保留工厂函数，供高级用户使用
export { makeRumPublicApi } from './boot/rumPublicApi'

// 导出类型
export type { RumPublicApi } from './boot/rumPublicApi'
export type {
  BeforeSamplingCallback,
  BeforeSamplingContext,
  RumInitConfiguration,
  RumConfiguration,
} from './domain/configuration/configuration'
export type { RumEvent } from './rumEvent.types'
export type { RawRumEvent } from './rawRumEvent.types'
