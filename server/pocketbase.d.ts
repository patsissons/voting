// The slice of PocketBase's JSVM globals the hooks bundle uses (PocketBase
// 0.39, goja). The full generated declarations land in .pb/pb_data/types.d.ts
// after the first local run; this file only has to be right about what
// server/*.ts calls, and keeps the typecheck independent of that download.
export {}

declare global {
  /** A PocketBase core.Record as goja exposes it. */
  interface PbRecord {
    id: string
    get(field: string): unknown
    getString(field: string): string
    getBool(field: string): boolean
    set(field: string, value: unknown): void
  }

  interface PbCollection {
    id: string
    name: string
  }

  interface PbApp {
    findFirstRecordByFilter(
      collection: string,
      filter: string,
      params?: Record<string, unknown>,
    ): PbRecord
    findRecordsByFilter(
      collection: string,
      filter: string,
      sort: string,
      limit: number,
      offset: number,
      params?: Record<string, unknown>,
    ): PbRecord[]
    findCollectionByNameOrId(nameOrId: string): PbCollection
    save(record: PbRecord): void
  }

  interface PbHeader {
    get(name: string): string
    set(name: string, value: string): void
  }

  interface PbUrlValues {
    get(name: string): string
  }

  interface PbRequest {
    method: string
    body: unknown
    header: PbHeader
    url: { path: string; query(): PbUrlValues }
    pathValue(name: string): string
  }

  interface PbResponse {
    header(): PbHeader
  }

  /** core.RequestEvent */
  interface RequestEvent {
    app: PbApp
    request: PbRequest
    response: PbResponse
    json(status: number, body: unknown): void
    html(status: number, body: string): void
    string(status: number, body: string): void
    blob(status: number, contentType: string, body: unknown): void
    noContent(status: number): void
    redirect(status: number, url: string): void
    fileFS(fs: unknown, name: string): void
  }

  interface PbHttpResponse {
    statusCode: number
    body: unknown
    headers: Record<string, string[]>
  }

  const $app: PbApp
  const $http: {
    send(options: {
      url: string
      method?: string
      headers?: Record<string, string>
      body?: string
      timeout?: number
    }): PbHttpResponse
  }
  const $os: {
    getenv(name: string): string
    readFile(path: string): unknown
    dirFS(path: string): unknown
  }
  const $security: {
    equal(a: string, b: string): boolean
    sha256(text: string): string
    md5(text: string): string
  }
  const __hooks: string
  /** goja's console (log only; no DOM lib in the server typecheck). */
  const console: {
    log(...parts: unknown[]): void
    warn(...parts: unknown[]): void
    error(...parts: unknown[]): void
  }

  /** Bytes (or anything) as a string; the optional cap applies to request bodies. */
  function toString(value: unknown, maxBytes?: number): string
  function routerAdd(
    method: string,
    path: string,
    handler: (e: RequestEvent) => unknown,
  ): void
  function cronAdd(name: string, expression: string, handler: () => void): void

  /** `new Record(collection)`; a value declaration so it coexists with TypeScript's Record<K, V> type. */
  const Record: new (collection: PbCollection) => PbRecord
}
