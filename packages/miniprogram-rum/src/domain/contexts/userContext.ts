import { createContextManager } from '@flashcatcloud/miniprogram-core'

export function startUserContext() {
  return createContextManager({
    propertiesConfig: {
      id: { type: 'string' },
      name: { type: 'string' },
      email: { type: 'string' },
    },
  })
}
