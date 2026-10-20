const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

/** The path names the election (/<slug>); the hash names the view. No router library. */
export function slugFromPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  return parts.length === 1 && SLUG_RE.test(parts[0]) ? parts[0] : ''
}
