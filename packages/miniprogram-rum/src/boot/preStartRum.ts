import type { RumInitConfiguration, RumConfiguration } from '../domain/configuration/configuration'
import { validateAndBuildRumConfiguration } from '../domain/configuration/configuration'
import type { Strategy } from './rumPublicApi'
import type { PlatformAdapter } from '@flashcatcloud/miniprogram-platform'

export function createPreStartStrategy(
  adapter: PlatformAdapter,
  startRum: (configuration: RumConfiguration, adapter: PlatformAdapter) => Strategy,
): Strategy {
  const buffer: Array<(strategy: Strategy) => void> = []
  let initConfiguration: RumInitConfiguration | undefined

  function applyBuffer(strategy: Strategy) {
    buffer.splice(0, buffer.length).forEach((call) => call(strategy))
  }

  const preStartStrategy: Strategy = {
    init: (configuration, publicApi) => {
      initConfiguration = configuration
      preStartStrategy.initConfiguration = initConfiguration
      const rumConfiguration = validateAndBuildRumConfiguration(configuration)
      if (!rumConfiguration) {
        return
      }
      const started = startRum(rumConfiguration, adapter)
      started.initConfiguration = initConfiguration
      applyBuffer(started)
      Object.assign(publicApi, {
        getInitConfiguration: () => initConfiguration,
      })
    },
    initConfiguration,
    addAction: (name, type) => buffer.push((strategy) => strategy.addAction(name, type)),
    addError: (message, source, stack) => buffer.push((strategy) => strategy.addError(message, source, stack)),
    addTiming: (name, time) => buffer.push((strategy) => strategy.addTiming(name, time)),
    addCustomEvent: (name, context) => buffer.push((strategy) => strategy.addCustomEvent(name, context)),
    setGlobalContext: (context) => buffer.push((strategy) => strategy.setGlobalContext(context)),
    setUser: (context) => buffer.push((strategy) => strategy.setUser(context)),
    startPage: (name) => buffer.push((strategy) => strategy.startPage(name)),
    stopSession: () => buffer.push((strategy) => strategy.stopSession()),
    getInitConfiguration: () => initConfiguration,
  }

  return preStartStrategy
}
