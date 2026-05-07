const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function getExpectedVersion(env = process.env, explicitVersion) {
  if (explicitVersion) {
    return normalizeVersion(explicitVersion)
  }

  if (env.GITHUB_REF_TYPE === 'tag' && env.GITHUB_REF_NAME?.startsWith('v')) {
    return normalizeVersion(env.GITHUB_REF_NAME.slice(1))
  }

  return undefined
}

function getNpmDistTag(version) {
  return version.includes('-') ? 'next' : 'latest'
}

function buildPublishArgs({ dryRun, distTag }) {
  const args = ['publish', '--access', 'public', '--registry', 'https://registry.npmjs.org/', '--tag', distTag]
  if (dryRun) {
    args.push('--dry-run')
  }
  return args
}

function normalizeVersion(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid release version: ${version}`)
  }
  return version
}

module.exports = {
  getExpectedVersion,
  getNpmDistTag,
  buildPublishArgs,
}
