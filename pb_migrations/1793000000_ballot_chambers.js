/// <reference path="../.pb/pb_data/types.d.ts" />
// The fourth ballot mode: `chambers`, a results-only election (the US
// midterms). The `ballot` select on `elections` lists its values, so a new
// mode is a migration; the rest of the mode lives in the config column.
migrate(
  (app) => {
    const elections = app.findCollectionByNameOrId('elections')
    const ballot = elections.fields.getByName('ballot')
    ballot.values = ['at-large', 'district', 'referendum', 'chambers']
    app.save(elections)
  },
  (app) => {
    const elections = app.findCollectionByNameOrId('elections')
    const ballot = elections.fields.getByName('ballot')
    ballot.values = ['at-large', 'district', 'referendum']
    app.save(elections)
  },
)
