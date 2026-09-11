import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

/**
 * Builds the Signal K plugin half of the package: a single bundled CommonJS file.
 * `.cjs` matters — the package itself is `"type": "module"`, and Signal K's
 * loader tries `require()` first (node_modules/signalk-server/dist/modules.js,
 * `importOrRequire`), only falling back to the slower `import()`-and-resolve path
 * when that fails. A `.js` file here would take that slower path for no reason.
 *
 * No dependency is bundled in because the plugin has none at runtime — only
 * `node:*` built-ins, which are left external.
 */
export default defineConfig({
  // Vite's default publicDir is the literal `public/` folder, which is the main
  // app's own build *output* (see vite.config.ts's outDir) by the time this runs
  // second — without this, Vite dutifully copies that whole build into
  // plugin-dist/ as "static assets" alongside the bundle. A Node library build
  // has no static assets of its own to copy.
  publicDir: false,
  build: {
    outDir: 'plugin-dist',
    emptyOutDir: true,
    target: 'node20',
    sourcemap: true,
    lib: {
      entry: 'plugin/index.ts',
      formats: ['cjs'],
      fileName: () => 'index.cjs'
    },
    rollupOptions: {
      external: [...builtinModules, ...builtinModules.map((name) => `node:${name}`)]
    }
  }
})
