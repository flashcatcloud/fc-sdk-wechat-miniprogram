const INTERNAL_REQUEST_KEY = '__flashcat_internal_request__'

type InternalRequestOptions = {
  [INTERNAL_REQUEST_KEY]?: true
}

export function markInternalRequest<T extends object>(options: T): T {
  Object.defineProperty(options, INTERNAL_REQUEST_KEY, {
    value: true,
    configurable: true,
  })
  return options
}

export function isInternalRequest(options: object): boolean {
  return (options as InternalRequestOptions)[INTERNAL_REQUEST_KEY] === true
}
