# data/export

`pnpm data:export` writes one dated directory here with the cubby.fyi
`voting_elections` rows, every `voting_results` row and the three static
election JSON files it read. Both collections are public, so it needs no
credentials; with `CUBBY_SUPERUSER_EMAIL` and `CUBBY_SUPERUSER_PASSWORD` it
also exports the hidden `results_*` columns, which only the cutover import
(`--hidden`) uses. The directories are gitignored; `pnpm data:transform`
turns the newest one into `elections/*.json` and `data/import/results.jsonl`,
and `pnpm data:import` loads that into an instance (`--sync` overwrites the
instance's results for every exported election to match the export).

Since the 2026-10-20 cutover every election's results land only on the
voting instance, so `--sync` from a cubby export would delete the rows cubby
never saw. Keep these tools for archiving the cubby data, not for mirroring.
