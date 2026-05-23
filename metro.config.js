const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Exclude the src/ directory (Next.js files that don't belong in this Expo project)
config.resolver.blockList = [
  /\/the-book-app\/src\/.*/,
]

module.exports = config
