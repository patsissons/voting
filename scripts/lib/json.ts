// JSON that reads like the hand-written election documents: two-space
// indentation, but a value that is short enough, or an array of primitives
// (slates, axis pairs, candidate rows), stays on one line. Prettier would
// explode every candidate row over six lines, so elections/ is in
// .prettierignore and `pnpm elections:check --write` reformats with this.

const INLINE = 160
const INLINE_OBJECT = 400

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

function isPrimitive(v: Json): boolean {
  return v === null || typeof v !== 'object'
}

/** Arrays whose elements are primitives or arrays of primitives stay on one line. */
function flatArray(v: Json): boolean {
  return (
    Array.isArray(v) &&
    v.every((x) => isPrimitive(x) || (Array.isArray(x) && x.every(isPrimitive)))
  )
}

function shallowObject(v: Json): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  return Object.values(v).every(
    (x) =>
      isPrimitive(x) ||
      flatArray(x) ||
      (x &&
        typeof x === 'object' &&
        !Array.isArray(x) &&
        Object.values(x).every(isPrimitive)),
  )
}

/** One-line JSON with spaces after commas and colons. */
function inlineJson(value: Json): string {
  if (isPrimitive(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(inlineJson).join(', ')}]`
  const keys = Object.keys(value as object)
  if (!keys.length) return '{}'
  return `{ ${keys.map((k) => `${JSON.stringify(k)}: ${inlineJson((value as Record<string, Json>)[k])}`).join(', ')} }`
}

export function compactJson(value: Json, indent = ''): string {
  if (isPrimitive(value)) return JSON.stringify(value)
  const flat = inlineJson(value)
  if (flatArray(value) && flat.length <= INLINE_OBJECT) return flat
  if (flat.length <= INLINE) return flat
  if (shallowObject(value) && flat.length <= INLINE_OBJECT) return flat
  const inner = `${indent}  `
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return `[\n${value.map((v) => `${inner}${compactJson(v, inner)}`).join(',\n')}\n${indent}]`
  }
  const keys = Object.keys(value as object)
  if (!keys.length) return '{}'
  return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${compactJson((value as Record<string, Json>)[k], inner)}`).join(',\n')}\n${indent}}`
}

/** The file text for a document: compact JSON with a trailing newline. */
export function documentText(value: unknown): string {
  return `${compactJson(value as Json)}\n`
}
