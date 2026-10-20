/// <reference path="../pb_data/types.d.ts" />

// PocketBase JS hooks run inside the instance's JSVM.
// Docs: https://pocketbase.io/docs/js-overview/
// NOTE: avoid registering routes PocketBase already owns (e.g. /api/health,
// /api/collections) — duplicate route patterns panic the server at boot.
routerAdd('GET', '/api/ping', (e) => {
  return e.json(200, { status: 'ok' })
})
