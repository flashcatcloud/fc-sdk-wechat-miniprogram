export function jsonStringify(data: unknown) {
  try {
    return JSON.stringify(data)
  } catch {
    return undefined
  }
}
