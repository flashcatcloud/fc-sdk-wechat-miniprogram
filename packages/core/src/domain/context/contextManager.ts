export interface Context {
  [key: string]: unknown
}

export type PropertiesConfig = {
  [key: string]: {
    type?: 'string'
  }
}

export interface ContextManager {
  setContext: (context: Context) => void
  getContext: () => Context
  setContextProperty: (key: string, value: unknown) => void
  removeContextProperty: (key: string) => void
  clearContext: () => void
}

function cloneContext(context: Context): Context {
  if (typeof structuredClone === 'function') {
    return structuredClone(context)
  }
  return JSON.parse(JSON.stringify(context)) as Context
}

function ensureProperties(context: Context, propertiesConfig: PropertiesConfig): Context {
  const next = { ...context }
  for (const [key, { type }] of Object.entries(propertiesConfig)) {
    const value = next[key]
    if (type === 'string' && value !== undefined && value !== null && value !== '') {
      next[key] = String(value)
    }
  }
  return next
}

export function createContextManager({ propertiesConfig = {} }: { propertiesConfig?: PropertiesConfig } = {}): ContextManager {
  let context: Context = {}
  return {
    setContext: (next) => {
      context = cloneContext(ensureProperties(next, propertiesConfig))
    },
    getContext: () => cloneContext(context),
    setContextProperty: (key, value) => {
      context = cloneContext(ensureProperties({ ...context, [key]: value }, propertiesConfig))
    },
    removeContextProperty: (key) => {
      const { [key]: _, ...rest } = context
      context = rest
    },
    clearContext: () => {
      context = {}
    },
  }
}
