import { useEffect, useState } from 'react'

function current(): string {
  return typeof window === 'undefined' ? '' : window.location.hash
}

/**
 * The URL hash, kept current across `hashchange`. Views parse it themselves
 * (tabs and compass codes live in the hash so shared links survive the move
 * from cubby.fyi).
 */
export function useHash(): string {
  const [hash, setHash] = useState<string>(current)
  useEffect(() => {
    const onChange = () => setHash(current())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}
