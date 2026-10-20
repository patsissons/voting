// localStorage with the keys cubby.fyi used. The two origins cannot read each
// other's storage, so the answers and ballot marks move in the permalink and
// the riding, swaps and division in an import link (consumeImport). Every
// access is guarded: private mode or blocked storage just means nothing
// persists.
import { parseImport } from '../../shared/permalink.ts'
import type { Election } from '../../shared/schema/election.ts'

export const keys = {
  compass: (slug: string) => `voting:${slug}:compass`,
  district: (slug: string) => `voting:${slug}:district`,
  omit: (slug: string) => `voting:${slug}:omit`,
  ballot: (slug: string) => `voting:${slug}:ballot`,
  division: (slug: string) => `voting:${slug}:ed`,
}

export function readString(key: string): string {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

export function writeString(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // the choice still shows until the page reloads
  }
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed == null ? fallback : (parsed as T)
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // the quiz still works, it just will not survive a reload
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // nothing to remove
  }
}

/**
 * Follow an import link (#/compass/import/...): store what it carries, then
 * swap the address for the plain permalink so a reload or a share never
 * imports again. Returns whether the hash was an import link.
 */
export function consumeImport(election: Election): boolean {
  if (typeof window === 'undefined') return false
  const found = parseImport(election, window.location.hash)
  if (!found) return false
  const slug = election.slug
  if (found.district) writeString(keys.district(slug), found.district)
  if (found.omit) writeJson(keys.omit(slug), found.omit)
  if (found.division) writeString(keys.division(slug), found.division)
  window.history.replaceState(null, '', found.hash)
  return true
}
