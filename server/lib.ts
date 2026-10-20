// The single entry esbuild bundles into pb_hooks/lib/voting.js (CommonJS,
// es2020, no npm). Each pb_hooks/*.pb.js handler requires that file and calls
// one function from here; PocketBase runs every handler in its own context,
// so the require happens inside the handler, and the module is cached until
// the next restart.
export { handleFetch, handleIngest, handleSource, cronFetch } from './routes.ts'
export { storeSnapshot, fetchTick, setSource } from './store.ts'
export { pocketbaseDb } from './db.ts'
