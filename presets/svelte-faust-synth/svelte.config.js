/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
  // Promote every Svelte compiler warning to a build error so the chassis stays
  // warning-clean: a reintroduced warning fails `npm run build` (non-zero exit)
  // rather than being printed and ignored. This gate travels with the preset via
  // new-app.sh / sync-kernel.sh, so generated and synced apps inherit it.
  onwarn(warning, defaultHandler) {
    throw new Error(`Svelte compiler warning treated as error: ${warning.code}\n${warning.message}`)
  },
}
