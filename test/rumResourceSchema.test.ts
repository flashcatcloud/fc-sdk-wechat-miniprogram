import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const schemasRoot = path.resolve(testDir, '../rum-events-format/schemas')

function readSchema(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(schemasRoot, relativePath), 'utf8'))
}

test('rum events schema includes resource events instead of legacy request events', () => {
  const schema = readSchema('rum-events-schema.json')
  const refs = schema.oneOf.map((entry: { $ref: string }) => entry.$ref)

  assert.ok(refs.includes('rum/resource-schema.json'))
  assert.equal(refs.includes('rum/request-schema.json'), false)
})

test('resource schema defines current miniprogram resource format', () => {
  const schema = readSchema('rum/resource-schema.json')
  const resourceProperties = schema.allOf[1].properties.resource.properties
  const ddProperties = schema.allOf[1].properties._dd.properties

  assert.deepEqual(resourceProperties.type.enum, ['xhr', 'js', 'css', 'image', 'font', 'media', 'other'])
  assert.equal(resourceProperties.type.enum.includes('upload'), false)
  assert.ok(ddProperties.trace_id)
  assert.ok(ddProperties.span_id)
})
