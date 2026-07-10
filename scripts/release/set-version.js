const fs = require('fs')
const path = require('path')
const { packages } = require('./packages')

const version = process.argv[2]

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: yarn release:version <version>')
  process.exit(1)
}

for (const packageInfo of packages) {
  const packageJsonPath = path.join(packageInfo.directory, 'package.json')
  const packageJson = readJson(packageJsonPath)

  packageJson.version = version

  for (const dependencyType of ['dependencies', 'peerDependencies', 'devDependencies']) {
    const dependencies = packageJson[dependencyType]
    if (!dependencies) {
      continue
    }

    for (const dependencyName of Object.keys(dependencies)) {
      if (dependencyName.startsWith('@flashcatcloud/miniprogram-')) {
        dependencies[dependencyName] = version
      }
    }
  }

  writeJson(packageJsonPath, packageJson)
  console.log(`Updated ${packageJson.name} to ${version}`)
}

// Keep the SDK_VERSION constant (reported via ddtags sdk_version) in sync.
const sdkVersionPath = path.join(__dirname, '../../packages/core/src/domain/configuration/sdkVersion.ts')
const sdkVersionSource = fs.readFileSync(sdkVersionPath, 'utf8')
fs.writeFileSync(sdkVersionPath, sdkVersionSource.replace(/SDK_VERSION = '[^']*'/, `SDK_VERSION = '${version}'`))
console.log(`Updated SDK_VERSION constant to ${version}`)

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}
