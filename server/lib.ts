// The single entry esbuild bundles into pb_hooks/lib/voting.js (CommonJS,
// es2020, no npm). Each pb_hooks/*.pb.js handler requires that file and calls
// one function from here; PocketBase runs every handler in its own context,
// so the require happens inside the handler, and the module is cached until
// the next restart.
export {
  handleFetch,
  handleIngest,
  handleSource,
  cronFetch,
  handleEarlyVote,
  cronEarlyVote,
} from './routes.ts'
export { handlePage, handleLlms } from './pages.ts'
export { handleMcp, methodNotAllowed } from './mcp/serve.ts'
export { storeSnapshot, fetchTick, setSource } from './store.ts'
export { earlyVoteTick } from './early-vote.ts'
export { pocketbaseDb } from './db.ts'
