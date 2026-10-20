import { describe, expect, it } from 'vitest'
import { compactJson, documentText } from './json.ts'

describe('compactJson', () => {
  it('keeps short values and primitive arrays on one line', () => {
    expect(compactJson({ a: 1, b: [1, 2, 3] })).toBe(
      '{ "a": 1, "b": [1, 2, 3] }',
    )
    expect(
      compactJson([
        [101, 'Joyce Gillespie'],
        [103, 'Mike Klassen', 1],
      ]),
    ).toBe('[[101, "Joyce Gillespie"], [103, "Mike Klassen", 1]]')
  })

  it('breaks long objects one key per line', () => {
    const long = {
      title: 'x'.repeat(200),
      list: [{ deep: { deeper: 'y'.repeat(200) } }],
    }
    const text = compactJson(long)
    expect(text.split('\n')[0]).toBe('{')
    expect(text).toContain('\n  "title": "')
    expect(JSON.parse(text)).toEqual(long)
    expect(documentText({ a: 1 })).toBe('{ "a": 1 }\n')
  })
})
