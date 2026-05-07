import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      return listSourceFiles(filePath)
    }
    return filePath.endsWith('.ts') ? [filePath] : []
  })
}

test('SDK console messages use formal FlashCat RUM prefixes without emoji', () => {
  const messages = listSourceFiles(join(process.cwd(), 'packages')).flatMap((filePath) => {
    const source = readFileSync(filePath, 'utf8')
    return Array.from(source.matchAll(/console\.(?:log|warn|error)\('([^']*FlashCat RUM[^']*)'/g)).map((match) => ({
      filePath,
      message: match[1],
    }))
  })

  assert.ok(messages.length > 0)

  for (const { filePath, message } of messages) {
    assert.match(message, /^\[FlashCat RUM\]\[(Debug|Warn|Error)\] /, `${filePath}: ${message}`)
    assert.doesNotMatch(message, /\p{Extended_Pictographic}/u, `${filePath}: ${message}`)
  }
})
