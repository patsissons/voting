/// <reference path="../.pb/pb_data/types.d.ts" />
// POST /mcp: a public, read-only MCP server over the elections and results
// (stateless streamable HTTP, JSON-RPC). GET and DELETE answer 405. The
// logic is server/mcp/*.ts in lib/voting.js.
routerAdd('POST', '/mcp', (e) => require(`${__hooks}/lib/voting.js`).handleMcp(e))
routerAdd('GET', '/mcp', (e) => require(`${__hooks}/lib/voting.js`).methodNotAllowed(e))
routerAdd('DELETE', '/mcp', (e) => require(`${__hooks}/lib/voting.js`).methodNotAllowed(e))
