import { lingui } from '@lingui/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { resolve } from 'path';

/**
 * Lingui's plugin, in both processes that show text.
 *
 * It does two things: it compiles a `.po` catalog on the fly, so the catalog is
 * imported like any other module, and it turns the `t`, `msg` and `Trans`
 * macros into runtime calls. Both builds need both, since the main process
 * shows the box that says Desktop could not start.
 *
 * `descriptorFields: 'all'` keeps the English text beside each message id in
 * the compiled output, where the plugin would drop it in a production build.
 * It is the last fallback of the chain, so a stale catalog shows English rather
 * than a message id. `pnpm i18n:check` is what keeps the catalog from going
 * stale in the first place.
 */
function linguiPlugins(): ReturnType<typeof lingui> {
  return lingui({
    macroTransform: { macro: { descriptorFields: 'all' } },
    failOnCompileError: true,
  });
}

export default defineConfig({
  main: {
    // Dependencies are externalized by default since electron-vite 5 (build.externalizeDeps)
    build: { sourcemap: true },
    plugins: [...linguiPlugins()],
  },
  preload: {
    build: {
      // The sandboxed preload cannot resolve node_modules at runtime,
      // so its dependencies must stay bundled instead of externalized
      externalizeDeps: false,
      rollupOptions: {
        output: {
          // With a sandboxed renderer and preload process the preload cannot use ESM
          // This is still a limitation of using ESM in Electron
          // @see https://www.electronjs.org/docs/latest/tutorial/esm#summary-esm-support-matrix
          // @see https://github.com/alex8088/electron-vite/discussions/423#discussioncomment-8922407
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    // Emit source maps so a local build can be debugged with readable stack
    // traces. electron-builder excludes out/renderer/**/*.map from the asar
    // (see electron-builder.yml), so the multi-MB maps stay on disk and never
    // ship inside the packaged app.
    build: { sourcemap: true },
    resolve: {
      alias: {
        '@root': resolve(__dirname, '.'),
        '@renderer': resolve(__dirname, './src/renderer'),
      },
    },
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        // Absolute paths, since the plugin resolves relative ones against
        // the renderer's Vite root (src/renderer), not the project root
        routesDirectory: resolve(__dirname, './src/renderer/routes'),
        generatedRouteTree: resolve(
          __dirname,
          './src/renderer/routeTree.gen.ts'
        ),
      }),
      viteReact(),
      tailwindcss(),
      ...linguiPlugins(),
    ],
  },
});
