const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch all monorepo packages
config.watchFolders = [monorepoRoot]

// Resolve from both project and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules')
]

// Shim Node.js modules that core may transitively reference but mobile never calls
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shimModules = ['child_process', 'fs', 'path', 'events', 'net', 'tls', 'http', 'https', 'stream', 'zlib', 'os', 'crypto', 'buffer', 'url', 'util', 'querystring']
  if (shimModules.includes(moduleName)) {
    return { type: 'empty' }
  }
  // Block SDK imports from being bundled on mobile — they rely on Node.js
  if (moduleName === '@anthropic-ai/sdk' || moduleName === 'openai') {
    return { type: 'empty' }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
