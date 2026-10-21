import { ArrowLeft, ArrowRight, ExternalLink, Globe, Lock, Monitor, RotateCw, Smartphone, Tablet } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cn } from '../../lib/cn'
import { Button, IconButton } from '../ui'

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

/** Address shown without the scheme, like a real browser ("bridgebench.ai/prompts"). */
const shortUrl = (url: string): string => url.replace(/^https?:\/\//i, '').replace(/\/$/, '')

/** Preview the page at a phone's or tablet's width. */
const DEVICES = [
  { id: 'desktop', label: 'Desktop', width: undefined, Icon: Monitor },
  { id: 'tablet', label: 'Tablet (820 px)', width: 820, Icon: Tablet },
  { id: 'phone', label: 'Phone (390 px)', width: 390, Icon: Smartphone }
] as const
type Device = (typeof DEVICES)[number]['id']

export function BrowserView({
  initialUrl,
  onUrlChange,
  onTitleChange
}: {
  initialUrl: string
  onUrlChange?: (url: string) => void
  /** The page's title, or '' while there is none (nothing loaded, or the load failed). */
  onTitleChange?: (title: string) => void
}) {
  const ref = useRef<WebviewEl | null>(null)
  const [src] = useState(() => normaliseUrl(initialUrl))
  const [address, setAddress] = useState(src)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [nav, setNav] = useState({ back: false, forward: false })
  const [device, setDevice] = useState<Device>('desktop')
  const width = DEVICES.find((d) => d.id === device)?.width

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
      if (ev.isMainFrame && ev.errorCode !== -3) {
        setFailed(ev.validatedURL)
        onTitleChange?.('')
      }
    }
    const onTitle = (e: Event): void => onTitleChange?.((e as Event & { title: string }).title.trim())
    el.addEventListener('did-navigate', onNavigate)
    el.addEventListener('did-navigate-in-page', onNavigate)
    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    el.addEventListener('did-fail-load', onFail)
    el.addEventListener('page-title-updated', onTitle)
    return () => {
      el.removeEventListener('did-navigate', onNavigate)
      el.removeEventListener('did-navigate-in-page', onNavigate)
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
      el.removeEventListener('did-fail-load', onFail)
      el.removeEventListener('page-title-updated', onTitle)
    }
  }, [onUrlChange, onTitleChange])

  const go = (e: FormEvent): void => {
    e.preventDefault()
    const url = normaliseUrl(address)
    setAddress(url)
    setFailed(null)
    ;(document.activeElement as HTMLElement | null)?.blur()
    void ref.current?.loadURL(url).catch(() => undefined)
  }
  const secure = /^https:\/\//i.test(address)

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <form onSubmit={go} className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line px-1.5">
        <IconButton label="Back" disabled={!nav.back} onClick={() => ref.current?.goBack()}>
          <ArrowLeft size={14} />
        </IconButton>
        <IconButton label="Forward" disabled={!nav.forward} onClick={() => ref.current?.goForward()}>
          <ArrowRight size={14} />
        </IconButton>
        <div className="relative mx-1 min-w-0 flex-1">
          {secure ? (
            <Lock size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
          ) : (
            <Globe size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
          )}
          <input
            aria-label="Address"
            value={editing ? address : shortUrl(address)}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => {
              setEditing(true)
              // Select once the full address is in the field.
              const input = e.target
              requestAnimationFrame(() => input.select())
            }}
            onBlur={() => setEditing(false)}
            className="h-7 w-full rounded-lg border border-transparent bg-surface pl-7 pr-2 font-mono text-[12.5px] text-fg hover:border-line focus:border-[#6b6b75] focus:outline-none"
          />
        </div>
        <IconButton label="Reload" onClick={() => ref.current?.reload()}>
          <RotateCw size={14} className={loading ? 'animate-spin' : undefined} />
        </IconButton>
        <div className="ml-0.5 flex items-center" role="radiogroup" aria-label="Preview size">
          {DEVICES.map(({ id, label, Icon }) => (
            <IconButton key={id} label={label} role="radio" aria-checked={device === id} onClick={() => setDevice(id)} className={cn(device === id && 'bg-hover text-fg')}>
              <Icon size={14} />
            </IconButton>
          ))}
        </div>
        <IconButton label="Open in your browser" onClick={() => void window.api.app.openExternal(address)}>
          <ExternalLink size={13} />
        </IconButton>
      </form>
      <div className={cn('relative min-h-0 flex-1', width && 'bg-bg')}>
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2" style={{ width: width ? `min(${width}px, 100%)` : '100%' }}>
          <webview ref={ref as never} src={src} partition="persist:agentdeck-browser" className="absolute inset-0 h-full w-full" />
        </div>
        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-panel p-6 text-center">
            <div className="text-sm font-semibold text-fg">Nothing is running at this address yet</div>
            <div className="max-w-xs text-xs leading-relaxed text-fg-muted">
              {failed}
              <br />
              Start your app (for example ask your agent to “run the dev server”), then press Reload.
            </div>
            <Button size="sm" className="mt-2" onClick={() => ref.current?.reload()}>
              Reload
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
