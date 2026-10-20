/// <reference path="../pb_data/types.d.ts" />

// Headless first-admin bootstrap: if INITIAL_ADMIN_EMAIL and
// INITIAL_ADMIN_PASSWORD are set (PocketHost dashboard → Secrets) and no
// matching superuser exists, one is created at startup. With PocketHost's
// Admin Sync (on by default) your pockethost.io login already works, so this
// is only needed for fully headless setups.
onBootstrap((e) => {
  e.next()

  const email = $os.getenv('INITIAL_ADMIN_EMAIL')
  const password = $os.getenv('INITIAL_ADMIN_PASSWORD')
  if (!email || !password) return

  try {
    e.app.findAuthRecordByEmail('_superusers', email)
    return // already exists
  } catch (err) {
    // not found — create below
  }

  const superusers = e.app.findCollectionByNameOrId('_superusers')
  const record = new Record(superusers)
  record.set('email', email)
  record.set('password', password)
  e.app.save(record)
  console.log('[admin] bootstrapped superuser ' + email)
})
