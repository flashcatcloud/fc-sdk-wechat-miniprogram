const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { packages } = require('./packages')

const dryRun = process.argv.includes('--dry-run')
const npmCache = process.env.NPM_CONFIG_CACHE || path.join(os.tmpdir(), 'fc-sdk-wechat-miniprogram-npm-cache')
const npmrcPath = path.join(process.cwd(), '.npmrc')
let wroteNpmrc = false

try {
  run('yarn', ['build'])
  run('node', ['scripts/release/check-release.js'])

  if (!dryRun) {
    if (!process.env.NPM_TOKEN) {
      throw new Error('NPM_TOKEN is not set')
    }

    fs.writeFileSync(npmrcPath, `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`)
    wroteNpmrc = true
  }

  for (const packageInfo of packages) {
    const args = ['publish', '--access', 'public', '--registry', 'https://registry.npmjs.org/']
    if (dryRun) {
      args.push('--dry-run')
    }

    run('npm', args, packageInfo.directory)
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
