import { useEffect, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { logger } from '@/lib/logger'
import { pb } from '@/lib/pocketbase'
import type { PostsRecord } from '@/lib/pocketbase-types'

type PostsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; posts: PostsRecord[] }

export function HomePage() {
  const [state, setState] = useState<PostsState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    pb.collection('posts')
      .getFullList<PostsRecord>({ sort: '-created' })
      .then((posts) => {
        if (!cancelled) setState({ status: 'ready', posts })
      })
      .catch((error: unknown) => {
        logger.error('failed to load posts', error)
        if (!cancelled) {
          setState({
            status: 'error',
            message:
              'Could not reach PocketBase. Check VITE_POCKETBASE_URL in your .env.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">voting</h1>
        <p className="text-muted-foreground mt-1">
          Your PocketHost-backed app shell is running. Start building!
        </p>
      </div>

      {state.status === 'loading' && (
        <p className="text-muted-foreground">Loading posts…</p>
      )}

      {state.status === 'error' && (
        <Card>
          <CardHeader>
            <CardTitle>Backend unreachable</CardTitle>
            <CardDescription>{state.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {state.status === 'ready' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {state.posts.map((post) => (
            <Card key={post.id}>
              <CardHeader>
                <CardTitle>{post.title}</CardTitle>
                <CardDescription>
                  {new Date(post.created).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{post.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
