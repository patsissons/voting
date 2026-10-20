// Share a permalink: the native share sheet where there is one, else copy,
// with a QR code for handing the link to a phone. The URL is the viewer's
// own state (a compass code, a ballot), never sent anywhere.
import { Check, Copy, QrCode, Share2 } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { copyText, shareUrl } from '@/lib/share'

export function ShareButton({
  url,
  title,
  label = 'Share',
  size = 'sm',
}: {
  url: string
  title: string
  label?: string
  size?: 'sm' | 'default'
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const t = setTimeout(() => setState('idle'), 1800)
    return () => clearTimeout(t)
  }, [state])
  const canShare = typeof navigator !== 'undefined' && !!navigator.share
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={async () => {
          const outcome = await shareUrl(url, title)
          if (outcome === 'copied') setState('copied')
          else if (outcome === 'failed') setState('failed')
        }}
      >
        {state === 'copied' ? (
          <Check className="size-4" />
        ) : canShare ? (
          <Share2 className="size-4" />
        ) : (
          <Copy className="size-4" />
        )}
        {state === 'copied'
          ? 'Copied'
          : state === 'failed'
            ? 'Copy failed'
            : label}
      </Button>
      {canShare ? (
        <Button
          type="button"
          variant="outline"
          size={size}
          aria-label="Copy link"
          onClick={async () =>
            setState((await copyText(url)) ? 'copied' : 'failed')
          }
        >
          <Copy className="size-4" />
        </Button>
      ) : null}
      <QrDialog url={url} title={title} size={size} />
    </div>
  )
}

function QrDialog({
  url,
  title,
  size,
}: {
  url: string
  title: string
  size: 'sm' | 'default'
}) {
  const [open, setOpen] = useState(false)
  const [src, setSrc] = useState('')
  useEffect(() => {
    if (!open) return
    let cancelled = false
    QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then((data) => {
        if (!cancelled) setSrc(data)
      })
      .catch(() => setSrc(''))
    return () => {
      cancelled = true
    }
  }, [open, url])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          aria-label="Show QR code"
        >
          <QrCode className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs text-center">
        <DialogHeader>
          <DialogTitle className="break-words">{title}</DialogTitle>
          <DialogDescription>
            Scan to open this link on another device.
          </DialogDescription>
        </DialogHeader>
        {src ? (
          <img
            src={src}
            alt={`QR code for ${url}`}
            width={240}
            height={240}
            className="mx-auto rounded-md bg-white p-2 [image-rendering:pixelated]"
          />
        ) : (
          <div className="bg-muted mx-auto h-60 w-60 animate-pulse rounded-md" />
        )}
        <p className="text-muted-foreground font-mono text-xs break-all">
          {url}
        </p>
      </DialogContent>
    </Dialog>
  )
}
