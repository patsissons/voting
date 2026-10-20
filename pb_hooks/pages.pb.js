/// <reference path="../.pb/pb_data/types.d.ts" />
// GET /{slug}: an election page with its <title> and og:* tags rewritten
// from the row (so pasted links unfurl), /<slug>.md (the markdown page),
// the dotted static files at the root, and a 404 shell for anything else;
// GET /llms.txt is the agent index. Only the one-segment pattern is
// registered: GET / and /{slug}/ would swallow the static files. The logic
// is server/pages.ts in lib/voting.js.
routerAdd('GET', '/llms.txt', (e) => require(`${__hooks}/lib/voting.js`).handleLlms(e))
routerAdd('GET', '/{slug}', (e) => require(`${__hooks}/lib/voting.js`).handlePage(e))
