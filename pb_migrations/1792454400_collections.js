/// <reference path="../.pb/pb_data/types.d.ts" />
// The two collections. `elections` is one row per election: the columns the
// index lists and the rules filter on, the hidden server-fetch state, and the
// whole election document in `config` (authored as elections/<slug>.json and
// pushed with `pnpm elections:push`; declared last so the other columns never
// traverse its overflow pages). `results` is one row per distinct results
// snapshot, written only by the hooks (server/store.ts runs as the app and
// bypasses rules), so every client write rule is null. Keeping each snapshot
// rather than overwriting one row gives the page its election-night
// timeline. No seed rows: the push script and the import script own data.
migrate(
  (app) => {
    const elections = new Collection({
      type: 'base',
      name: 'elections',
      listRule: 'published = true',
      viewRule: 'published = true',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'slug', type: 'text', required: true, min: 1, max: 100, pattern: '^[a-z0-9][a-z0-9-]*$' },
        { name: 'title', type: 'text', required: true, max: 200 },
        { name: 'description', type: 'text', max: 1000 },
        { name: 'voting_day', type: 'date' },
        { name: 'published', type: 'bool' },
        { name: 'ballot', type: 'select', maxSelect: 1, values: ['at-large', 'district', 'referendum'] },
        { name: 'results_source', type: 'url', hidden: true },
        { name: 'results_checked', type: 'date', hidden: true },
        { name: 'results_error', type: 'text', hidden: true, max: 500 },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        { name: 'config', type: 'json', maxSize: 1000000 },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_elections_slug` ON `elections` (`slug`)'],
    })
    app.save(elections)
    const electionsId = app.findCollectionByNameOrId('elections').id

    const results = new Collection({
      type: 'base',
      name: 'results',
      listRule: 'election.published = true',
      viewRule: 'election.published = true',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'election', type: 'relation', required: true, collectionId: electionsId, maxSelect: 1, cascadeDelete: true },
        { name: 'source_ts', type: 'text', required: true, max: 40 },
        { name: 'sig', type: 'text', max: 32 },
        { name: 'format', type: 'text', max: 20 },
        { name: 'official', type: 'bool' },
        { name: 'polls_closed', type: 'number', onlyInt: true },
        { name: 'polls_total', type: 'number', onlyInt: true },
        { name: 'schema_version', type: 'number', onlyInt: true },
        { name: 'fetched', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'payload', type: 'json', maxSize: 2000000 },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_results_snapshot` ON `results` (`election`, `source_ts`)',
        'CREATE INDEX `idx_results_official` ON `results` (`election`, `official`)',
      ],
    })
    app.save(results)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('results'))
    app.delete(app.findCollectionByNameOrId('elections'))
  }
)
