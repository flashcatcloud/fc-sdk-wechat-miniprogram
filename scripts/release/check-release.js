const fs = require('fs')
const path = require('path')
const { packages } = require('./packages')

const expectedVersion = process.argv[2]
let releaseVersion = expectedVersion

for (const packageInfo of packages) {
  const packageJsonPath = path.join(packageInfo.directory, 'package.json')
  const packageJson = readJson(packageJsonPath)

  if (packageJson.name !== packageInfo.name) {
    fail(`${packageJsonPath}: expected package name ${packageInfo.name}, got ${packageJson.name}`)
  }

  if (packageJson.private) {
    fail(`${packageJsonPath}: remove private:true before publishing`)
  }

  if (packageJson.publishConfig?.access !== 'public') {
    fail(`${packageJsonPath}: publishConfig.access must be public`)
  }

  if (!releaseVersion) {
    releaseVersion = packageJson.version
  }

  if (packageJson.version !== releaseVersion) {
    fail(`${packageJsonPath}: expected version ${releaseVersion}, got ${packageJson.version}`)
  }

  for (const dependencyType of ['dependencies', 'peerDependencies', 'devDependencies']) {
    const dependencies = packageJson[dependencyType]
    if (!dependencies) {
      continue
    }

    for (const [dependencyName, dependencyVersion] of Object.entries(dependencies)) {
      if (dependencyName.startsWith('@flashcatcloud/miniprogram-') && dependencyVersion !== releaseVersion) {
        fail(`${packageJsonPath}: ${dependencyName} must use ${releaseVersion}, got ${dependencyVersion}`)
      }
    }
  }

  checkPackageEntry(packageInfo.directory, packageJson, 'main')
  checkPackageEntry(packageInfo.directory, packageJson, 'types')

  if (packageJson.miniprogram !== 'dist') {
    fail(`${packageJsonPath}: miniprogram must point to dist`)
  }

  if (!Array.isArray(packageJson.files) || !packageJson.files.includes('dist')) {
    fail(`${packageJsonPath}: files must include dist`)
  }
}

const sdkVersionPath = path.join(__dirname, '../../packages/core/src/domain/configuration/sdkVersion.ts')
const sdkVersionSource = fs.readFileSync(sdkVersionPath, 'utf8')
const sdkVersionMatch = sdkVersionSource.match(/SDK_VERSION = '([^']+)'/)
if (!sdkVersionMatch) {
  fail(`${sdkVersionPath}: unable to find SDK_VERSION`)
}
if (sdkVersionMatch[1] !== releaseVersion) {
  fail(`${sdkVersionPath}: expected SDK_VERSION ${releaseVersion}, got ${sdkVersionMatch[1]}`)
}

console.log(`Release check passed for ${releaseVersion}`)

function checkPackageEntry(packageDirectory, packageJson, field) {
  if (!packageJson[field]) {
    fail(`${packageDirectory}/package.json: missing ${field}`)
  }

  const entryPath = path.join(packageDirectory, packageJson[field])
  if (!fs.existsSync(entryPath)) {
    fail(`${packageDirectory}/package.json: ${field} entry ${packageJson[field]} does not exist. Run yarn build first.`)
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
