import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))

let gitBranch
try {
  gitBranch =
    process.env.GITHUB_REF_NAME || execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
} catch {
  gitBranch = 'unknown'
}

export default defineConfig({
  base: './',
  build: { minify: false },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __GIT_BRANCH__: JSON.stringify(gitBranch),
    // Placeholder values for the preset's standalone build so the Shell's
    // header renders sensible text rather than the raw identifier name. A
    // generated app (slice 3, new-app.sh) overrides these define entries in
    // its own vite.config.js with the app's actual title + repo URL. The
    // app-namespace sentinel stays as a string-literal substitution
    // (consumed by createPatchStorage / createWheelPhysicsStore /
    // new MidiCcMap), not a Vite define identifier — define would not
    // touch string literals.
    __APP_TITLE__: JSON.stringify('svelte-faust-synth'),
    __APP_REPO_URL__: JSON.stringify('https://github.com/davidirvine/agent-workflow-kernel'),
  },
  plugins: [svelte()],
  server: { strictPort: true },
  resolve: {
    conditions: ['browser'],
    alias: process.env.VITEST
      ? {}
      : {
          fs: resolve('./src/lib/stubs/fs.js'),
          url: resolve('./src/lib/stubs/url.js'),
        },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
    include: ['src/**/*.test.js'],
    passWithNoTests: true,
  },
})
