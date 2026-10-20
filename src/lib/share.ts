// Sharing a permalink: the native share sheet where there is one, otherwise
// the clipboard; the QR dialog (components/share-button.tsx) is the third
// route for passing a link to a phone.

export type ShareOutcome = 'shared' | 'copied' | 'failed'

export async function shareUrl(
  url: string,
  title: string,
): Promise<ShareOutcome> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare?.({ url })
  ) {
    try {
      await navigator.share({ url, title })
      return 'shared'
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return 'failed'
    }
  }
  return copyText(url).then((ok) => (ok ? 'copied' : 'failed'))
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
