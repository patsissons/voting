import { expect, test } from '@playwright/test'

// The hook routes, as a crawler or an agent sees them, against the real
// PocketBase: no browser involved.
test.describe('agent surface', () => {
  test('an election page carries its own title and social tags', async ({
    request,
  }) => {
    const res = await request.get('/bc-2026')
    expect(res.status()).toBe(200)
    expect(res.headers()['cache-control']).toContain('max-age=300')
    const html = await res.text()
    expect(html).toContain('<title>BC Votes 2026 · Voting</title>')
    expect(html).toMatch(/property="og:title"\s+content="BC Votes 2026"/)
    expect(html).toMatch(
      /property="og:url"\s+content="https:\/\/voting\.lgtm\.page\/bc-2026"/,
    )
    expect(html).toMatch(/name="description"\s+content="Fifteen questions/)
    expect(html).toContain('id="root"')
  })

  test('an unknown slug is a 404 shell and static files still serve', async ({
    request,
  }) => {
    const missing = await request.get('/no-such-election')
    expect(missing.status()).toBe(404)
    expect(missing.headers()['cache-control']).toBe('no-store')
    expect(await missing.text()).toContain('id="root"')
    for (const file of [
      '/favicon.svg',
      '/robots.txt',
      '/theme-init.js',
      '/og.png',
    ]) {
      const res = await request.get(file)
      expect(res.status(), file).toBe(200)
    }
    expect(
      (await request.get('/theme-init.js')).headers()['content-type'],
    ).toContain('javascript')
  })

  test('the markdown page answers by extension and by Accept', async ({
    request,
  }) => {
    const md = await request.get('/vancouver-2026.md')
    expect(md.status()).toBe(200)
    expect(md.headers()['content-type']).toContain('text/markdown')
    const text = await md.text()
    expect(text).toMatch(/^# Vancouver Votes 2026\n/)
    expect(text).toContain(
      '## Results (unofficial, as of 2026-10-17 23:40:00 Pacific time)',
    )
    expect(text).toContain('## Compass questions')
    const negotiated = await request.get('/alberta-2026', {
      headers: { Accept: 'text/markdown' },
    })
    expect(negotiated.headers()['content-type']).toContain('text/markdown')
    expect(await negotiated.text()).toContain('### Question 10: Separation')
    expect((await request.get('/no-such-election.md')).status()).toBe(404)
  })

  test('llms.txt indexes the elections and the tools', async ({ request }) => {
    const res = await request.get('/llms.txt')
    expect(res.status()).toBe(200)
    const text = await res.text()
    expect(text).toContain('# Voting')
    expect(text).toContain(
      '[BC Votes 2026](https://voting.lgtm.page/bc-2026.md)',
    )
    expect(text).toContain('/mcp')
  })

  test('the MCP endpoint answers initialize, tools/list and tools/call', async ({
    request,
  }) => {
    const rpc = async (body: unknown, headers: Record<string, string> = {}) =>
      request.post('/mcp', {
        data: body,
        headers: { 'content-type': 'application/json', ...headers },
      })
    const init = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    })
    expect(init.status()).toBe(200)
    expect((await init.json()).result.serverInfo.name).toBe('voting')
    expect(
      (
        await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })
      ).status(),
    ).toBe(202)
    const list = await (
      await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    ).json()
    expect(list.result.tools.map((t: { name: string }) => t.name)).toContain(
      'closest_districts',
    )
    const near = await (
      await rpc({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'closest_districts',
          arguments: { slug: 'bc-2026', n: 3 },
        },
      })
    ).json()
    expect(near.result.structuredContent.ridings.length).toBe(3)
    const series = await (
      await rpc({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'results_series',
          arguments: { slug: 'alberta-2026', metric: 'votes', contest: 'q3' },
        },
      })
    ).json()
    expect(series.result.structuredContent.rows.length).toBe(10)
    const bad = await (
      await rpc({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'closest_districts',
          arguments: { slug: 'vancouver-2026' },
        },
      })
    ).json()
    expect(bad.error.code).toBe(-32602)
    expect(
      (
        await request.post('/mcp', {
          data: Buffer.from('{not json'),
          headers: { 'content-type': 'application/json' },
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await rpc(
          { jsonrpc: '2.0', id: 6, method: 'ping' },
          { Origin: 'https://evil.example' },
        )
      ).status(),
    ).toBe(403)
    const get = await request.get('/mcp')
    expect(get.status()).toBe(405)
    expect(get.headers()['allow']).toBe('POST')
  })
})
