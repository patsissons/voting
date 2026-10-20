import { describe, expect, it } from 'vitest'
import {
  describeServer,
  dispatch,
  ERR,
  parseBody,
  shapeResult,
  validateArgs,
  validateModule,
  type ToolModule,
} from './rpc.ts'

const module: ToolModule<{ tag: string }> = {
  tools: [
    {
      name: 'echo',
      description: 'echo',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', minLength: 1 },
          n: { type: 'integer', minimum: 1, maximum: 3 },
        },
        required: ['text'],
        additionalProperties: false,
      },
    },
    { name: 'boom', description: 'boom', inputSchema: { type: 'object' } },
  ],
  call(name, args, ctx) {
    if (name === 'echo')
      return { text: `${ctx.tag}:${args.text}`, n: args.n ?? null }
    throw new Error('it broke')
  },
}
const describe_ = describeServer({
  name: 'voting',
  title: 'Voting',
  instructions: 'be nice',
})
const opts = { module, describe: describe_, ctx: { tag: 't' } }
const msg = (method: string, params?: unknown, id: unknown = 1) => ({
  jsonrpc: '2.0',
  id,
  method,
  params,
})
const one = (method: string, params?: unknown) =>
  dispatch([msg(method, params)], false, opts)

describe('rpc core', () => {
  it('parses single messages and batches', () => {
    expect(parseBody('{"a":1}')).toEqual({ messages: [{ a: 1 }], batch: false })
    expect(parseBody('[{"a":1}]')).toEqual({
      messages: [{ a: 1 }],
      batch: true,
    })
    expect(() => parseBody('nope')).toThrow(/parse error/)
  })

  it('answers both handshakes from one description', () => {
    const init = one('initialize', { protocolVersion: '2025-06-18' })
    expect(init.status).toBe(200)
    expect(
      (
        init.body as {
          result: {
            protocolVersion: string
            serverInfo: { title: string }
            instructions: string
          }
        }
      ).result,
    ).toMatchObject({
      protocolVersion: '2025-06-18',
      serverInfo: { name: 'voting', title: 'Voting' },
      instructions: 'be nice',
    })
    expect(
      (
        one('initialize', { protocolVersion: '1999-01-01' }).body as {
          result: { protocolVersion: string }
        }
      ).result.protocolVersion,
    ).toBe('2025-11-25')
    const discover = (
      one('server/discover').body as {
        result: {
          resultType: string
          supportedVersions: string[]
          cacheScope: string
        }
      }
    ).result
    expect(discover.resultType).toBe('complete')
    expect(discover.supportedVersions[0]).toBe('2026-07-28')
    expect(discover.cacheScope).toBe('public')
    expect((one('ping').body as { result: unknown }).result).toEqual({})
  })

  it('lists and calls tools with validated arguments', () => {
    expect(
      (
        one('tools/list').body as { result: { tools: { name: string }[] } }
      ).result.tools.map((t) => t.name),
    ).toEqual(['echo', 'boom'])
    const ok = one('tools/call', {
      name: 'echo',
      arguments: { text: 'hi', n: 2 },
    }).body as {
      result: { structuredContent: unknown; content: { text: string }[] }
    }
    expect(ok.result.structuredContent).toEqual({ text: 't:hi', n: 2 })
    expect(JSON.parse(ok.result.content[0].text)).toEqual({
      text: 't:hi',
      n: 2,
    })
    const bad = one('tools/call', {
      name: 'echo',
      arguments: { text: '', n: 9, extra: 1 },
    }).body as { error: { code: number; message: string } }
    expect(bad.error.code).toBe(ERR.INVALID_PARAMS)
    expect(bad.error.message).toBe(
      'arguments.text must be at least 1 chars; arguments.n must be <= 3; arguments.extra is not allowed',
    )
    expect(
      (
        one('tools/call', { name: 'nope' }).body as {
          error: { message: string }
        }
      ).error.message,
    ).toBe('unknown tool "nope"')
    const failed = one('tools/call', { name: 'boom' }).body as {
      result: { isError: boolean; content: { text: string }[] }
    }
    expect(failed.result.isError).toBe(true)
    expect(failed.result.content[0].text).toBe('it broke')
    expect(
      (one('nope/method').body as { error: { code: number } }).error.code,
    ).toBe(ERR.METHOD_NOT_FOUND)
  })

  it('handles notifications, batches and bad envelopes', () => {
    expect(
      dispatch(
        [{ jsonrpc: '2.0', method: 'notifications/initialized' }],
        false,
        opts,
      ).status,
    ).toBe(202)
    const batch = dispatch(
      [
        msg('ping', undefined, 1),
        msg('ping', undefined, 2),
        { jsonrpc: '2.0', method: 'notifications/x' },
      ],
      true,
      opts,
    )
    expect(batch.status).toBe(200)
    expect((batch.body as unknown[]).length).toBe(2)
    expect(
      (dispatch([], true, opts).body as { error: { message: string } }).error
        .message,
    ).toBe('empty batch')
    expect(
      (
        dispatch(Array(21).fill(msg('ping')), true, opts).body as {
          error: { message: string }
        }
      ).error.message,
    ).toBe('batch exceeds 20 messages')
    expect(
      (
        dispatch([{ nope: true }], false, opts).body as {
          error: { code: number }
        }
      ).error.code,
    ).toBe(ERR.INVALID_REQUEST)
    const modern = one('tools/list', {
      _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
    }).body as { result: { resultType: string; ttlMs: number } }
    expect(modern.result.resultType).toBe('complete')
    expect(modern.result.ttlMs).toBe(300000)
  })

  it('validates schemas and shapes results', () => {
    expect(
      validateArgs(
        {
          type: 'object',
          properties: { s: { type: 'string', pattern: '^a' } },
        },
        { s: 'b' },
      ),
    ).toEqual(['arguments.s must match ^a'])
    expect(
      validateArgs({ type: 'array', items: { type: 'integer' } }, [1, 1.5]),
    ).toEqual(['arguments[1] must be integer'])
    expect(validateArgs({ enum: ['a', 'b'] }, 'c')).toEqual([
      'arguments must be one of "a", "b"',
    ])
    expect(shapeResult('hi')).toEqual({
      content: [{ type: 'text', text: 'hi' }],
    })
    expect(shapeResult(null)).toEqual({ content: [{ type: 'text', text: '' }] })
    expect(
      shapeResult('x'.repeat(200001)).content[0].text!.endsWith('[truncated]'),
    ).toBe(true)
    expect(validateModule(module)).toEqual([])
    expect(validateModule({ tools: [{ name: 'Bad Name' }], call: 1 })).toEqual([
      'tools[0].name must match /^[a-z][a-z0-9_]{0,63}$/',
      'call must be a function',
    ])
  })
})
