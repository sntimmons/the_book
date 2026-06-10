const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Exclude the src/ directory (Next.js files that don't belong in this Expo project)
config.resolver.blockList = [
  /\/the-book-app\/src\/.*/,
]

config.resolver.assetExts.push('mp4')

// Force ONLY @supabase/supabase-js to its Hermes-safe CJS build. Its ESM build
// (dist/index.mjs, which Metro otherwise picks via the package "import"
// condition) contains a dynamic `import()` of a runtime variable for an
// optional OpenTelemetry hook; hermesc -O cannot parse that and the production
// export fails ("Invalid expression encountered"). The CJS build uses
// `require()` instead and compiles fine. @opentelemetry/api isn't installed, so
// the hook is inert either way — this only changes which build of supabase-js
// is bundled. Scoped to the bare specifier so no other package's resolution
// (including supabase-js subpaths and its own sub-dependencies) is affected;
// everything else passes through to the default resolver unchanged.
const supabaseCjsEntry = require.resolve('@supabase/supabase-js/dist/index.cjs')
const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@supabase/supabase-js') {
    return { type: 'sourceFile', filePath: supabaseCjsEntry }
  }
  return (defaultResolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  )
}

module.exports = config
