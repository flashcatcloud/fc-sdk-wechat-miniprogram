export function buildTags(configuration: { env?: string; service?: string; version?: string }): string[] {
  const { env, service, version } = configuration
  const tags: string[] = []

  if (env) {
    tags.push(buildTag('env', env))
  }
  if (service) {
    tags.push(buildTag('service', service))
  }
  if (version) {
    tags.push(buildTag('version', version))
  }

  return tags
}

function buildTag(key: string, rawValue: string): string {
  // Let the backend do most of the sanitization, but still make sure multiple
  // tags can't be crafted by forging a value containing commas.
  const sanitizedValue = rawValue.replace(/,/g, '_')
  return `${key}:${sanitizedValue}`
}
