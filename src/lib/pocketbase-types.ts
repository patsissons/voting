// Minimal record types for the scaffolded schema.
// Regenerate from the live schema with the `typegen` script after changing
// pb_migrations/ (see README.md).

export interface PostsRecord {
  id: string
  title: string
  body: string
  created: string
  updated: string
}

export interface UsersRecord {
  id: string
  email: string
  name: string
  avatar: string
  created: string
  updated: string
}
