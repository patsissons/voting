/// <reference path="../pb_data/types.d.ts" />

// Example collection proving the full loop: migration → typegen → typed
// fetch → render. Replace with your real schema as the app takes shape.
migrate(
  (app) => {
    const collection = new Collection({
      type: 'base',
      name: 'posts',
      listRule: '',
      viewRule: '',
      fields: [
        { type: 'text', name: 'title', required: true, max: 200 },
        { type: 'text', name: 'body', max: 10000 },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
    })
    app.save(collection)

    const record = new Record(collection)
    record.set('title', 'Hello from PocketBase')
    record.set(
      'body',
      'This post was created by a pb_migrations migration. Edit pb_migrations/ to evolve your schema, then run typegen to refresh your TypeScript types.',
    )
    app.save(record)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('posts')
    app.delete(collection)
  },
)
