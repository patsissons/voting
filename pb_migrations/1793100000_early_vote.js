/// <reference path="../.pb/pb_data/types.d.ts" />
// The early vote turnout the hooks pull before an election (server/early-vote.ts):
// `early_vote` holds the pulled counts and is public like the rest of the row;
// the hidden `early_vote_checked` and `early_vote_error` are the pull's state.
// Columns of their own, not keys in `config`, because `pnpm elections:push`
// rewrites `config` whole and would wipe what the hook wrote.
migrate(
  (app) => {
    const elections = app.findCollectionByNameOrId('elections')
    elections.fields.add(new JSONField({ name: 'early_vote', maxSize: 200000 }))
    elections.fields.add(new DateField({ name: 'early_vote_checked', hidden: true }))
    elections.fields.add(new TextField({ name: 'early_vote_error', hidden: true, max: 500 }))
    app.save(elections)
  },
  (app) => {
    const elections = app.findCollectionByNameOrId('elections')
    for (const name of ['early_vote', 'early_vote_checked', 'early_vote_error'])
      elections.fields.removeByName(name)
    app.save(elections)
  },
)
