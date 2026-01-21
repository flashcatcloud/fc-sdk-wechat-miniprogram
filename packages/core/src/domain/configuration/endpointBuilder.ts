export type TrackType = 'rum'

export interface EndpointBuilder {
  trackType: TrackType
  build: (payload: { encoding?: string }) => string
}

export function createEndpointBuilder(endpoint: string, trackType: TrackType): EndpointBuilder {
  return {
    trackType,
    build: (payload) => {
      const separator = endpoint.includes('?') ? '&' : '?'
      const params = [`track=${encodeURIComponent(trackType)}`]
      if (payload.encoding) {
        params.push(`encoding=${encodeURIComponent(payload.encoding)}`)
      }
      return `${endpoint}${separator}${params.join('&')}`
    },
  }
}
