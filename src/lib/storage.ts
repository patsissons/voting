// localStorage with the keys cubby.fyi used, so a visitor's compass answers,
// riding, swaps, ballot marks and division survive the move. Every access is
// guarded: private mode or blocked storage just means nothing persists.

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
