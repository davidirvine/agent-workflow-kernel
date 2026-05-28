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
