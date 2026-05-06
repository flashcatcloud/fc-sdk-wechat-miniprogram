export interface BoundedBuffer<T> {
  add: (item: T) => void
  drain: () => T[]
}

export function createBoundedBuffer<T>(sizeLimit: number): BoundedBuffer<T> {
  const buffer: T[] = []
  return {
    add: (item: T) => {
      if (buffer.length >= sizeLimit) {
        buffer.shift()
      }
      buffer.push(item)
    },
    drain: () => buffer.splice(0, buffer.length),
  }
}
