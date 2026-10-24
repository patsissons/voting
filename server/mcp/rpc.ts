// MCP (Model Context Protocol) server core: JSON-RPC parsing, method
// dispatch, tool argument validation and result shaping. Port of cubby.fyi's
// lib/mcp.js without the bearer token: the endpoint is public and read-only.
// Stateless Streamable HTTP: one POST per message (or legacy batch), plain
// application/json responses, no SSE, no sessions. Two handshakes are
// answered from one description: the legacy `initialize` (2025-03-26 ..
// 2025-11-25) and the 2026-07-28 `server/discover`. Touches no JSVM
// globals, so the tests run it in Node.

export const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26']
export const DISCOVER_VERSIONS = ['2026-07-28'].concat(SUPPORTED_VERSIONS)
export const BODY_LIMIT = 1048576
// Caching hints on server/discover and tools/list: the tools change only on
// a deploy, and nothing is per-client, so public scope.
export const CACHE_TTL_MS = 300000
export const CACHE_SCOPE = 'public'
export const MAX_BATCH = 20
export const MAX_TEXT = 200000
export const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/

export const ERR = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
}

export type JsonSchema = {
  type?: string | string[]
  required?: string[]
  properties?: Record<string, JsonSchema>
  additionalProperties?: boolean
  enum?: unknown[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  items?: JsonSchema
  description?: string
  default?: unknown
}

export type Tool = {
  name: string
  title?: string
  description: string
  inputSchema: JsonSchema
  annotations?: {
    readOnlyHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
}

export type ToolModule<Ctx> = {
  tools: Tool[]
  call: (name: string, args: Record<string, unknown>, ctx: Ctx) => unknown
}

export type RpcErrorBody = { code: number; message: string; data?: unknown }
export type RpcResponse = {
  jsonrpc: '2.0'
  id: unknown
  result?: unknown
  error?: RpcErrorBody
}

export function errorResponse(
  id: unknown,
  code: number,
  message: string,
  data?: unknown,
): RpcResponse {
  const error: RpcErrorBody = { code, message }
  if (data !== undefined) error.data = data
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error }
}

/** Thrown inside method handlers; dispatch turns it into a JSON-RPC error. */
export class RpcError extends Error {
  code: number
  data?: unknown
  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.code = code
    this.data = data
    this.name = 'RpcError'
  }
}

/** Thrown by a tool for a bad argument the schema could not catch. */
export class InvalidParams extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidParams'
  }
}

function clip(text: unknown, max: number): string {
  const s = String(text)
  return s.length > max ? s.slice(0, max) : s
}

export class ParseFailure extends Error {
  code = ERR.PARSE
}

/** Parse a raw request body. Throws ParseFailure when the body is not JSON at all. */
export function parseBody(raw: string): {
  messages: unknown[]
  batch: boolean
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ParseFailure('parse error')
  }
  if (Array.isArray(parsed)) return { messages: parsed, batch: true }
  return { messages: [parsed], batch: false }
}

/** Check a tool module's shape. Returns a list of problems (empty = valid). */
export function validateModule(module: unknown): string[] {
  const problems: string[] = []
  const m = module as ToolModule<unknown>
  if (!m || typeof m !== 'object') return ['module must be an object']
  if (!Array.isArray(m.tools)) problems.push('tools must be an array')
  else {
    const seen: Record<string, boolean> = {}
    m.tools.forEach((tool, i) => {
      if (!tool || typeof tool !== 'object') {
        problems.push(`tools[${i}] must be an object`)
        return
      }
      if (typeof tool.name !== 'string' || !TOOL_NAME_RE.test(tool.name)) {
        problems.push(`tools[${i}].name must match ${TOOL_NAME_RE}`)
        return
      }
      if (seen[tool.name]) problems.push(`duplicate tool name "${tool.name}"`)
      seen[tool.name] = true
      if (
        tool.inputSchema !== undefined &&
        (!tool.inputSchema || typeof tool.inputSchema !== 'object')
      )
        problems.push(`tools[${i}].inputSchema must be an object`)
    })
  }
  if (typeof m.call !== 'function') problems.push('call must be a function')
  return problems
}

export type ServerDescription = ReturnType<typeof describeServer>

/** One description feeds both handshakes. */
export function describeServer(opts: {
  name: string
  title?: string
  instructions?: string
  version?: string
}) {
  const serverInfo: { name: string; version: string; title?: string } = {
    name: opts.name,
    version: opts.version || '1',
  }
  if (opts.title) serverInfo.title = opts.title
  const instructions = opts.instructions || ''
  const capabilities = { tools: {} }
  return {
    serverInfo,
    capabilities,
    instructions,
    initialize(requested: unknown) {
      const protocolVersion =
        typeof requested === 'string' && SUPPORTED_VERSIONS.includes(requested)
          ? requested
          : SUPPORTED_VERSIONS[0]
      const result: Record<string, unknown> = {
        protocolVersion,
        capabilities,
        serverInfo,
      }
      if (instructions) result.instructions = instructions
      return result
    },
    discover() {
      const result: Record<string, unknown> = {
        resultType: 'complete',
        supportedVersions: DISCOVER_VERSIONS.slice(),
        capabilities,
        _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo },
        ttlMs: CACHE_TTL_MS,
        cacheScope: CACHE_SCOPE,
      }
      if (instructions) result.instructions = instructions
      return result
    },
  }
}

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * Lightweight JSON-schema subset validator. Returns a list of problems.
 * Supported: type, required, properties, additionalProperties:false, enum,
 * minimum/maximum, minLength/maxLength, pattern, items.
 */
export function validateArgs(
  schema: JsonSchema | undefined,
  value: unknown,
  path?: string,
): string[] {
  const problems: string[] = []
  if (!schema || typeof schema !== 'object') return problems
  const label = path || 'arguments'
  const type = typeOf(value)

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type]
    const ok = allowed.some((t) =>
      t === 'integer'
        ? type === 'number' && Number.isInteger(value)
        : t === type,
    )
    if (!ok) {
      problems.push(`${label} must be ${allowed.join(' or ')}`)
      return problems
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((v) => v === value)) {
    problems.push(
      `${label} must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`,
    )
  }
  if (type === 'number') {
    const n = value as number
    if (typeof schema.minimum === 'number' && n < schema.minimum)
      problems.push(`${label} must be >= ${schema.minimum}`)
    if (typeof schema.maximum === 'number' && n > schema.maximum)
      problems.push(`${label} must be <= ${schema.maximum}`)
  }
  if (type === 'string') {
    const s = value as string
    if (typeof schema.minLength === 'number' && s.length < schema.minLength)
      problems.push(`${label} must be at least ${schema.minLength} chars`)
    if (typeof schema.maxLength === 'number' && s.length > schema.maxLength)
      problems.push(`${label} must be at most ${schema.maxLength} chars`)
    if (typeof schema.pattern === 'string') {
      let ok: boolean
      try {
        ok = new RegExp(schema.pattern).test(s)
      } catch {
        ok = true
      }
      if (!ok) problems.push(`${label} must match ${schema.pattern}`)
    }
  }
  if (type === 'object') {
    const obj = value as Record<string, unknown>
    const props =
      schema.properties && typeof schema.properties === 'object'
        ? schema.properties
        : {}
    if (Array.isArray(schema.required))
      for (const key of schema.required)
        if (obj[key] === undefined) problems.push(`${label}.${key} is required`)
    for (const key of Object.keys(obj)) {
      if (props[key] !== undefined)
        problems.push(...validateArgs(props[key], obj[key], `${label}.${key}`))
      else if (schema.additionalProperties === false)
        problems.push(`${label}.${key} is not allowed`)
    }
  }
  if (type === 'array' && schema.items && typeof schema.items === 'object') {
    ;(value as unknown[]).forEach((item, i) =>
      problems.push(...validateArgs(schema.items, item, `${label}[${i}]`)),
    )
  }
  return problems
}

export type CallResult = {
  content: { type: string; text?: string }[]
  structuredContent?: unknown
  isError?: boolean
}

/** Shape whatever a tool's call() returned into a CallToolResult. */
export function shapeResult(ret: unknown): CallResult {
  let result: CallResult
  if (typeof ret === 'string') {
    result = { content: [{ type: 'text', text: ret }] }
  } else if (
    ret &&
    typeof ret === 'object' &&
    Array.isArray((ret as CallResult).content)
  ) {
    result = ret as CallResult
  } else if (ret && typeof ret === 'object') {
    result = {
      content: [{ type: 'text', text: JSON.stringify(ret, null, 2) }],
      structuredContent: ret,
    }
  } else {
    result = {
      content: [
        {
          type: 'text',
          text: ret === undefined || ret === null ? '' : String(ret),
        },
      ],
    }
  }
  // A text-only client should know the JSON stops early and where the rest is.
  const marker = `[truncated at ${MAX_TEXT} characters${result.structuredContent !== undefined ? '; the full result is in structuredContent' : ''}]`
  for (const item of result.content) {
    if (
      item &&
      item.type === 'text' &&
      typeof item.text === 'string' &&
      item.text.length > MAX_TEXT
    )
      item.text = `${item.text.slice(0, MAX_TEXT)}\n${marker}`
  }
  return result
}

function callTool<Ctx>(
  module: ToolModule<Ctx>,
  tool: Tool,
  args: Record<string, unknown>,
  ctx: Ctx,
): CallResult {
  let ret: unknown
  try {
    ret = module.call(tool.name, args, ctx)
  } catch (err) {
    if (err instanceof InvalidParams)
      throw new RpcError(ERR.INVALID_PARAMS, err.message)
    // Errors (including goja-wrapped Go errors, which carry a message) are
    // tool failures the model can act on, not protocol errors.
    if (
      err instanceof Error ||
      (err &&
        typeof err === 'object' &&
        typeof (err as Error).message === 'string')
    ) {
      return {
        content: [
          { type: 'text', text: String((err as Error).message || err) },
        ],
        isError: true,
      }
    }
    throw new RpcError(ERR.INTERNAL, clip(String(err), 300))
  }
  return shapeResult(ret)
}

type DispatchOptions<Ctx> = {
  module: ToolModule<Ctx>
  describe: ServerDescription
  ctx: Ctx
}

function handleMethod<Ctx>(
  method: string,
  params: Record<string, unknown>,
  opts: DispatchOptions<Ctx>,
): unknown {
  const { module, describe, ctx } = opts
  switch (method) {
    case 'initialize':
      return describe.initialize(params.protocolVersion)
    case 'server/discover':
      return describe.discover()
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: module.tools }
    case 'tools/call': {
      const name = params.name
      const tool =
        typeof name === 'string'
          ? module.tools.find((t) => t.name === name)
          : undefined
      if (!tool)
        throw new RpcError(ERR.INVALID_PARAMS, `unknown tool "${String(name)}"`)
      const args = params.arguments === undefined ? {} : params.arguments
      if (!args || typeof args !== 'object' || Array.isArray(args))
        throw new RpcError(ERR.INVALID_PARAMS, 'arguments must be an object')
      const problems = validateArgs(tool.inputSchema, args)
      if (problems.length)
        throw new RpcError(ERR.INVALID_PARAMS, problems.join('; '))
      return callTool(module, tool, args as Record<string, unknown>, ctx)
    }
    default:
      throw new RpcError(ERR.METHOD_NOT_FOUND, `method not found: ${method}`)
  }
}

/** A 2026-07-28+ client carries its protocol version in params._meta; its results are MRTR-shaped and carry resultType. */
function isModernRequest(params: Record<string, unknown>): boolean {
  const meta = params && params._meta
  const version =
    meta && typeof meta === 'object'
      ? (meta as Record<string, unknown>)[
          'io.modelcontextprotocol/protocolVersion'
        ]
      : undefined
  return typeof version === 'string' && !SUPPORTED_VERSIONS.includes(version)
}

/** Handle one message; returns a response object, or undefined for notifications. */
function handleMessage<Ctx>(
  msg: unknown,
  opts: DispatchOptions<Ctx>,
): RpcResponse | undefined {
  const isObject = !!msg && typeof msg === 'object' && !Array.isArray(msg)
  const m = msg as {
    jsonrpc?: unknown
    method?: unknown
    id?: unknown
    params?: unknown
  }
  if (!isObject || m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
    return errorResponse(
      isObject && m.id !== undefined ? m.id : null,
      ERR.INVALID_REQUEST,
      'invalid request',
    )
  }
  // No id: a notification (notifications/initialized and friends) is accepted silently.
  if (m.id === undefined) return undefined
  const params = (
    m.params && typeof m.params === 'object' && !Array.isArray(m.params)
      ? m.params
      : {}
  ) as Record<string, unknown>
  try {
    const result = handleMethod(m.method, params, opts)
    if (isModernRequest(params) && result && typeof result === 'object') {
      const r = result as Record<string, unknown>
      if (r.resultType === undefined) r.resultType = 'complete'
      if (m.method === 'tools/list') {
        r.ttlMs = CACHE_TTL_MS
        r.cacheScope = CACHE_SCOPE
      }
    }
    return { jsonrpc: '2.0', id: m.id, result }
  } catch (err) {
    if (err instanceof RpcError)
      return errorResponse(m.id, err.code, err.message, err.data)
    return errorResponse(
      m.id,
      ERR.INTERNAL,
      clip((err as Error).message || String(err), 300),
    )
  }
}

export type DispatchResult = {
  status: number
  body: unknown
  methods: string[]
  errors: number
}

/**
 * Dispatch parsed messages: status 202 with no body when every message was
 * a notification, else 200 with a single response or an array for a batch.
 */
export function dispatch<Ctx>(
  messages: unknown[],
  batch: boolean,
  opts: DispatchOptions<Ctx>,
): DispatchResult {
  const methods = messages.map((m) =>
    m &&
    typeof m === 'object' &&
    typeof (m as { method?: unknown }).method === 'string'
      ? ((m as { method: string }).method as string)
      : '?',
  )
  if (batch && messages.length === 0)
    return {
      status: 200,
      body: errorResponse(null, ERR.INVALID_REQUEST, 'empty batch'),
      methods,
      errors: 1,
    }
  if (batch && messages.length > MAX_BATCH)
    return {
      status: 200,
      body: errorResponse(
        null,
        ERR.INVALID_REQUEST,
        `batch exceeds ${MAX_BATCH} messages`,
      ),
      methods,
      errors: 1,
    }
  const responses: RpcResponse[] = []
  for (const msg of messages) {
    const res = handleMessage(msg, opts)
    if (res !== undefined) responses.push(res)
  }
  const errors = responses.filter((r) => r.error).length
  if (responses.length === 0)
    return { status: 202, body: undefined, methods, errors }
  return {
    status: 200,
    body: batch ? responses : responses[0],
    methods,
    errors,
  }
}
