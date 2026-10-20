/// <reference path="../.pb/pb_data/types.d.ts" />
// Results ingest: POST /_voting/ingest/{slug}[?official=1] with the raw
// results document as the body and "Authorization: Bearer
// $VOTING_INGEST_TOKEN". The logic is server/routes.ts, bundled into
// lib/voting.js by `pnpm build:hooks`; the require sits inside the handler
// because PocketBase runs each handler in its own context.
routerAdd('POST', '/_voting/ingest/{slug}', (e) => require(`${__hooks}/lib/voting.js`).handleIngest(e))
