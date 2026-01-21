import type { Configuration, InitConfiguration } from '@flashcatcloud/miniprogram-core'
import { validateAndBuildConfiguration } from '@flashcatcloud/miniprogram-core'

export interface RumInitConfiguration extends InitConfiguration {
  trackActions?: boolean
  trackRequests?: boolean
  trackErrors?: boolean
  trackPerformance?: boolean
  trackPages?: boolean
}

export interface RumConfiguration extends Configuration {
  trackActions: boolean
  trackRequests: boolean
  trackErrors: boolean
  trackPerformance: boolean
  trackPages: boolean
}

export function validateAndBuildRumConfiguration(
  initConfiguration: RumInitConfiguration
): RumConfiguration | undefined {
  const base = validateAndBuildConfiguration(initConfiguration)
  if (!base) {
    return
  }
  return {
    ...base,
    trackActions: initConfiguration.trackActions ?? true,
    trackRequests: initConfiguration.trackRequests ?? true,
    trackErrors: initConfiguration.trackErrors ?? true,
    trackPerformance: initConfiguration.trackPerformance ?? true,
    trackPages: initConfiguration.trackPages ?? true,
  }
}
