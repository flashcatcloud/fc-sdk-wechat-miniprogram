import type { EndpointBuilder } from './endpointBuilder'
import { createEndpointBuilder } from './endpointBuilder'

export interface InitConfiguration {
  clientToken: string
  applicationId: string
  endpoint: string
  sessionSampleRate?: number
  flushInterval?: number
  beforeSend?: (event: unknown) => boolean | void
  service?: string
  env?: string
  version?: string
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
}

export function validateAndBuildConfiguration(initConfiguration: InitConfiguration): Configuration | undefined {
  if (!initConfiguration.clientToken || !initConfiguration.applicationId || !initConfiguration.endpoint) {
    return
  }
  const sessionSampleRate = initConfiguration.sessionSampleRate ?? 100
  const flushInterval = initConfiguration.flushInterval ?? 15000
  return {
    clientToken: initConfiguration.clientToken,
    applicationId: initConfiguration.applicationId,
    endpointBuilder: createEndpointBuilder(initConfiguration.endpoint, 'rum'),
    sessionSampleRate,
    flushInterval,
    beforeSend: initConfiguration.beforeSend,
    service: initConfiguration.service,
    env: initConfiguration.env,
    version: initConfiguration.version,
  }
}
