/// <reference path="../.pb/pb_data/types.d.ts" />
// When an election's results became (or are expected to become) final, for
// the index cards: a mirror of finalResultsOf(doc) that `pnpm elections:push`
// writes with the other row columns (the index lists rows without config).
migrate(
  (app) => {
    const elections = app.findCollectionByNameOrId('elections')
    elections.fields.add(new DateField({ name: 'final_day' }))
    elections.fields.add(new BoolField({ name: 'final_expected' }))
    app.save(elections)
  },
  (app) => {
    const elections = app.findCollectionByNameOrId('elections')
    for (const name of ['final_day', 'final_expected'])
      elections.fields.removeByName(name)
    app.save(elections)
  },
)
