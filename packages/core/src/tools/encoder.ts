export interface EncoderResult {
  output: string
  outputBytesCount: number
}

export interface Encoder {
  isEmpty: boolean
  write: (data: string, onFlush?: (realBytesCount: number) => void) => void
  finish: (callback: (result: EncoderResult) => void) => void
}

export function createIdentityEncoder(): Encoder {
  let buffer = ''
  return {
    get isEmpty() {
      return buffer.length === 0
    },
    write: (data, onFlush) => {
      buffer += data
      onFlush?.(data.length)
    },
    finish: (callback) => {
      const output = buffer
      buffer = ''
      callback({ output, outputBytesCount: output.length })
    },
  }
}
