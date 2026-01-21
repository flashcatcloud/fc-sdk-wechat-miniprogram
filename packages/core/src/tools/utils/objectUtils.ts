export function shallowMerge<T extends Record<string, unknown>, U extends Record<string, unknown>>(
  target: T,
  source: U
) {
  return { ...target, ...source }
}
