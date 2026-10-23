/// <reference path="../.pb/pb_data/types.d.ts" />
// The early vote pull (server/early-vote.ts earlyVoteTick): before an
// election's polls close, fetches its results.earlyVote CSV and keeps the
// turnout in the row's early_vote column. Two triggers like the results
// fetch, because PocketHost hibernates idle instances: a cron four times a
// day (00:07, 06:07, 12:07, 18:07 UTC) while the instance is awake, and
// GET/POST /_voting/early-vote for a PocketHost webhook. Each election is pulled at most once every 15 minutes.
routerAdd('GET', '/_voting/early-vote', (e) => require(`${__hooks}/lib/voting.js`).handleEarlyVote(e))
routerAdd('POST', '/_voting/early-vote', (e) => require(`${__hooks}/lib/voting.js`).handleEarlyVote(e))
cronAdd('votingEarlyVote', '7 */6 * * *', () => require(`${__hooks}/lib/voting.js`).cronEarlyVote())
