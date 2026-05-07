const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { packages } = require('./packages')
const { buildPublishArgs, getExpectedVersion, getNpmDistTag } = require('./publish-options')

const dryRun = process.argv.includes('--dry-run')
const expectedVersion = getExpectedVersion(process.env, getArgValue('--expected-version'))
const npmCache = process.env.NPM_CONFIG_CACHE || path.join(os.tmpdir(), 'fc-sdk-wechat-miniprogram-npm-cache')
const npmrcPath = path.join(process.cwd(), '.npmrc')
let wroteNpmrc = false

try {
  run('yarn', ['build'])
  run('node', ['scripts/release/check-release.js', ...(expectedVersion ? [expectedVersion] : [])])

  const releaseVersion = expectedVersion || readPackageVersion(packages[0].directory)
  const distTag = getNpmDistTag(releaseVersion)

  if (!dryRun) {
    if (!process.env.NPM_TOKEN) {
      throw new Error('NPM_TOKEN is not set')
    }

    fs.writeFileSync(npmrcPath, `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`)
    wroteNpmrc = true
  }

  for (const packageInfo of packages) {
    run('npm', buildPublishArgs({ dryRun, distTag }), packageInfo.directory)
  }
} finally {
  if (wroteNpmrc && fs.existsSync(npmrcPath)) {
    fs.unlinkSync(npmrcPath)
  }
}

function run(command, args, cwd = process.cwd()) {
  console.log(`$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: npmCache,
    },
  })
}

function getArgValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

function readPackageVersion(packageDirectory) {
  const packageJsonPath = path.join(packageDirectory, 'package.json')
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version
}
