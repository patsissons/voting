import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bc } from '../scripts/fixtures/load.ts'
import { root } from '../scripts/lib/elections.ts'
import { originAllowed } from './mcp/serve.ts'
import { rewriteShell, shellOrigin } from './pages.ts'

const shell = readFileSync(`${root}/index.html`, 'utf8')

describe('the shell and its rewrite', () => {
  it('carries every tag the rewrite targets', () => {
    for (const attr of [
      'og:title',
      'og:description',
      'og:url',
      'og:image',
      'twitter:title',
      'twitter:description',
      'description',
    ]) {
      expect(shell, attr).toMatch(
        new RegExp(`(?:property|name)="${attr}"\\s+content="`),
      )
    }
    expect(shell).toMatch(/<title>[^<]*<\/title>/)
    expect(shellOrigin(shell)).toBe('https://voting.lgtm.page')
  })

  it('describes the site without naming the regions it covers', () => {
    const descriptions = [
      'description',
      'og:description',
      'twitter:description',
    ].map(
      (attr) =>
        new RegExp(`(?:property|name)="${attr}"\\s+content="([^"]*)"`).exec(
          shell,
        )?.[1],
    )
    expect(new Set(descriptions).size).toBe(1)
    expect(descriptions[0]).toMatch(/^Vote compasses/)
    expect(descriptions[0]).not.toMatch(/Vancouver|British Columbia|Alberta/)
  })

  it('rewrites the title, description and url for an election', () => {
    const e = bc()
    const html = rewriteShell(shell, e, 'https://voting.lgtm.page')
    expect(html).toContain('<title>BC Votes 2026 · Voting</title>')
    expect(html).toContain(
      'property="og:title"\n      content="BC Votes 2026"'
        .replace(/\n\s+/, ' ')
        .replace('property="og:title" content', 'property="og:title" content'),
    )
    expect(html).toMatch(
      /property="og:url"\s+content="https:\/\/voting\.lgtm\.page\/bc-2026"/,
    )
    expect(html).toMatch(/name="description"\s+content="Fifteen questions/)
    expect(html).toMatch(/name="twitter:title"\s+content="BC Votes 2026"/)
    expect(html).toContain('og.png')
    const quoted = rewriteShell(
      shell,
      { ...e, title: 'A "quoted" <title>' },
      'https://x',
    )
    expect(quoted).toContain(
      '<title>A &quot;quoted&quot; &lt;title&gt; · Voting</title>',
    )
  })
})

describe('originAllowed', () => {
  it('passes absent, own and local origins only', () => {
    expect(originAllowed('', 'voting.lgtm.page')).toBe(true)
    expect(originAllowed('https://voting.lgtm.page', 'voting.lgtm.page')).toBe(
      true,
    )
    expect(originAllowed('http://localhost:5173', 'voting.lgtm.page')).toBe(
      true,
    )
    expect(originAllowed('http://127.0.0.1:8090', '127.0.0.1:8090')).toBe(true)
    expect(originAllowed('https://evil.example', 'voting.lgtm.page')).toBe(
      false,
    )
    expect(originAllowed('null', 'voting.lgtm.page')).toBe(false)
  })
})
