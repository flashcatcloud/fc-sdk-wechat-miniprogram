import type { Context } from '@flashcatcloud/miniprogram-core'
import { monitor } from '@flashcatcloud/miniprogram-core'
import { getDefaultAdapter } from '@flashcatcloud/miniprogram-platform'
import type { RumInitConfiguration } from '../domain/configuration/configuration'
import type { ErrorSource } from '../rawRumEvent.types'
import { startRum } from './startRum'
import { createPreStartStrategy } from './preStartRum'

export interface Strategy {
  init: (initConfiguration: RumInitConfiguration, publicApi: RumPublicApi) => void
  initConfiguration: RumInitConfiguration | undefined
  addAction: (name: string, type?: string) => void
  addError: (message: string, source: ErrorSource, stack?: string) => void
  addTiming: (name: string, time?: number) => void
  addCustomEvent: (name: string, context?: Record<string, unknown>) => void
  setGlobalContext: (context: Context) => void
  setUser: (context: Context) => void
  startPage: (name?: string) => void
  stopSession: () => void
  getInitConfiguration: () => RumInitConfiguration | undefined
}

export interface RumPublicApi {
  init: (initConfiguration: RumInitConfiguration) => void
  addAction: (name: string, type?: string) => void
  addError: (message: string, source?: 'custom', stack?: string) => void
  addTiming: (name: string, time?: number) => void
  addCustomEvent: (name: string, context?: Record<string, unknown>) => void
  setGlobalContext: (context: Context) => void
  setUser: (context: Context) => void
  startPage: (name?: string) => void
  stopSession: () => void
  getInitConfiguration: () => RumInitConfiguration | undefined
}

export function makeRumPublicApi(): RumPublicApi {
  const adapter = getDefaultAdapter()
  let strategy: Strategy = createPreStartStrategy(adapter, (configuration, adapterInstance) => {
    const started = startRum(configuration, adapterInstance)
    const nextStrategy: Strategy = {
      init: () => undefined,
      initConfiguration: strategy.initConfiguration,
      addAction: started.addAction,
      addError: started.addError,
      addTiming: started.addTiming,
      addCustomEvent: started.addCustomEvent,
      setGlobalContext: (context) => started.globalContext.setContext(context),
      setUser: (context) => started.userContext.setContext(context),
      startPage: started.startPage,
      stopSession: () => started.sessionManager.expire(),
      getInitConfiguration: () => strategy.initConfiguration,
    }
    strategy = nextStrategy
    return nextStrategy
  })

  const rumPublicApi: RumPublicApi = {
    init: monitor((initConfiguration) => strategy.init(initConfiguration, rumPublicApi)),
    addAction: monitor((name, type) => strategy.addAction(name, type)),
    addError: monitor((message, source, stack) => strategy.addError(message, source || 'custom', stack)),
    addTiming: monitor((name, time) => strategy.addTiming(name, time)),
    addCustomEvent: monitor((name, context) => strategy.addCustomEvent(name, context)),
    setGlobalContext: monitor((context) => strategy.setGlobalContext(context)),
    setUser: monitor((context) => strategy.setUser(context)),
    startPage: monitor((name) => strategy.startPage(name)),
    stopSession: monitor(() => strategy.stopSession()),
    getInitConfiguration: monitor(() => strategy.getInitConfiguration()),
  }

  return rumPublicApi
}
