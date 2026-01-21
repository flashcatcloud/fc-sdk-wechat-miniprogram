export function sanitizeString(value: unknown) {
  return typeof value === 'string' ? value : ''
}
