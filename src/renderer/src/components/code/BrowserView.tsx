import { ArrowLeft, ArrowRight, ExternalLink, Globe, Maximize2, RotateCw } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { IconButton } from '../ui'

interface WebviewEl extends HTMLElement {
  loadURL(url: string): Promise<void>
  getURL(): string
  goBack(): void
  goForward(): void
  reload(): void
  canGoBack(): boolean
  canGoForward(): boolean
}

/** Turn what the user typed into a URL: "localhost:3000" → http, "example.com" → https. */
export function normaliseUrl(input: string): string {
  const raw = input.trim()
  if (!raw) return 'about:blank'
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(raw) || /^:\d+/.test(raw)) {
    return `http://${raw.startsWith(':') ? `localhost${raw}` : raw}`
  }
  return `https://${raw}`
}

export function BrowserView({
  initialUrl,
  onUrlChange,
  onPopOut
}: {
  initialUrl: string
  onUrlChange?: (url: string) => void
  onPopOut?: (url: string) => void
}) {
  const ref = useRef<WebviewEl | null>(null)
  const [src] = useState(() => normaliseUrl(initialUrl))
  const [address, setAddress] = useState(src)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [nav, setNav] = useState({ back: false, forward: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onNavigate = (e: Event): void => {
      const url = (e as Event & { url: string }).url
      setAddress(url)
      onUrlChange?.(url)
      setNav({ back: el.canGoBack(), forward: el.canGoForward() })
    }
    const onStart = (): void => {
      setLoading(true)
      setFailed(null)
    }
    const onStop = (): void => setLoading(false)
    const onFail = (e: Event): void => {
      const ev = e as Event & { errorCode: number; validatedURL: string; isMainFrame: boolean }
      // -3 = aborted (normal during redirects)
      if (ev.isMainFrame && ev.errorCode !== -3) setFailed(ev.validatedURL)
    }
    el.addEventListener('did-navigate', onNavigate)
    el.addEventListener('did-navigate-in-page', onNavigate)
    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    el.addEventListener('did-fail-load', onFail)
    return () => {
      el.removeEventListener('did-navigate', onNavigate)
      el.removeEventListener('did-navigate-in-page', onNavigate)
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
      el.removeEventListener('did-fail-load', onFail)
    }
  }, [onUrlChange])

  const go = (e: FormEvent): void => {
    e.preventDefault()
    const url = normaliseUrl(address)
    setAddress(url)
    setFailed(null)
    void ref.current?.loadURL(url).catch(() => undefined)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <form onSubmit={go} className="flex h-9 shrink-0 items-center gap-0.5 border-b border-line px-1.5">
        <IconButton label="Back" disabled={!nav.back} onClick={() => ref.current?.goBack()}>
          <ArrowLeft size={14} />
        </IconButton>
        <IconButton label="Forward" disabled={!nav.forward} onClick={() => ref.current?.goForward()}>
          <ArrowRight size={14} />
        </IconButton>
        <IconButton label="Reload" onClick={() => ref.current?.reload()}>
          <RotateCw size={14} className={loading ? 'animate-spin' : undefined} />
        </IconButton>
        <div className="relative mx-1 flex-1">
          <Globe size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            aria-label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="h-7 w-full rounded-md border border-line bg-surface pl-6 pr-2 text-xs text-fg focus:border-accent focus:outline-none"
          />
        </div>
        {onPopOut && (
          <IconButton label="Open as a pane" onClick={() => onPopOut(address)}>
            <Maximize2 size={13} />
          </IconButton>
        )}
        <IconButton label="Open in your browser" onClick={() => void window.api.app.openExternal(address)}>
          <ExternalLink size={13} />
        </IconButton>
      </form>
      <div className="relative min-h-0 flex-1">
        <webview ref={ref as never} src={src} partition="persist:agentdeck-browser" className="absolute inset-0 h-full w-full" />
        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg p-6 text-center">
            <div className="text-sm font-semibold text-fg">Nothing is running at this address yet</div>
            <div className="max-w-xs text-xs leading-relaxed text-fg-muted">
              {failed}
              <br />
              Start your app (for example ask your agent to “run the dev server”), then press Reload.
            </div>
            <button className="mt-2 rounded-md border border-line-strong bg-raised px-3 py-1.5 text-xs text-fg hover:bg-hover" onClick={() => ref.current?.reload()}>
              Reload
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
