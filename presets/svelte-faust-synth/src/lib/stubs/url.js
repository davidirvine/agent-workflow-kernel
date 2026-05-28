/** @param {string | URL} url */
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url
  return u.pathname
}

/** @param {string} path */
export function pathToFileURL(path) {
  return new URL('file://' + path)
}

export const URL = globalThis.URL
export const URLSearchParams = globalThis.URLSearchParams
