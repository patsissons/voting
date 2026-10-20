/// <reference path="../.pb/pb_data/types.d.ts" />
// The server-side results fetch (server/store.ts fetchTick): on election
// night, pulls an election's results source once a minute and stores each
// new count. Two triggers, because PocketHost hibernates idle instances and
// missed cron ticks are not replayed: the cron while the instance is awake,
// and GET/POST /_voting/fetch for a PocketHost webhook over the night. The
// source is set on the night, without a deploy, through the token-gated
// POST /_voting/source/{slug}?url=<page> (an empty url clears it).
routerAdd('GET', '/_voting/fetch', (e) => require(`${__hooks}/lib/voting.js`).handleFetch(e))
routerAdd('POST', '/_voting/fetch', (e) => require(`${__hooks}/lib/voting.js`).handleFetch(e))
routerAdd('POST', '/_voting/source/{slug}', (e) => require(`${__hooks}/lib/voting.js`).handleSource(e))
cronAdd('votingFetch', '* * * * *', () => require(`${__hooks}/lib/voting.js`).cronFetch())
