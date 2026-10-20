# data/export

`pnpm data:export` writes one dated directory here with the cubby.fyi
`voting_elections` rows (hidden fields included), every `voting_results` row
and the three static election JSON files it read. The directories are
gitignored; `pnpm data:transform` turns the newest one into
`elections/*.json` and `data/import/results.jsonl`, and `pnpm data:import`
loads that into an instance.
