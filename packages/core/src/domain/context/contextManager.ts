export interface Context {
  [key: string]: unknown;
}

export interface ContextManager {
  setContext: (context: Context) => void;
  getContext: () => Context;
  setContextProperty: (key: string, value: unknown) => void;
  removeContextProperty: (key: string) => void;
  clearContext: () => void;
}

export function createContextManager(): ContextManager {
  let context: Context = {};
  return {
    setContext: (next) => {
      context = { ...next };
    },
    getContext: () => ({ ...context }),
    setContextProperty: (key, value) => {
      context = { ...context, [key]: value };
    },
    removeContextProperty: (key) => {
      const { [key]: _, ...rest } = context;
      context = rest;
    },
    clearContext: () => {
      context = {};
    },
  };
}
