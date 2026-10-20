import { ArrowUp, Loader2, Mic, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { asPastedMessage } from '@shared/paste'
import { activeTerminalPtyId } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { writePty } from '../../lib/pty-bus'
import { errorText, toast, useApp } from '../../lib/store'
import { registerComposer, toggleRecording, useVoice } from '../../voice/dictation'
import { AgentIcon, IconButton, Kbd, Tip } from '../ui'

/** Send text to an agent's terminal as one message, then press Enter. */
function sendToPty(ptyId: string, text: string): void {
  writePty(ptyId, asPastedMessage(text))
  setTimeout(() => writePty(ptyId, '\r'), 60)
}

export function Composer() {
  const [text, setText] = useState('')
  const [enhancing, setEnhancing] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const recording = useVoice((s) => s.ptt.phase === 'recording')
  const pttKey = useApp((s) => s.snapshot!.settings.pushToTalkKey)
  // Re-render when focus moves between panes so the target label stays right.
  const target = useApp((s) => {
    void s.activePanel
    const id = activeTerminalPtyId()
    return id ? s.ptys[id] : undefined
  })

  useEffect(() => {
    registerComposer((t) => {
      setText((prev) => (prev && !/\s$/.test(prev) ? `${prev} ${t}` : prev + t))
      ref.current?.focus()
    })
    return () => registerComposer(null)
  }, [])

  // Grow with content up to ~6 lines.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [text])

  const send = (): void => {
    const value = text.trim()
    if (!value) return
    if (!target) {
      toast('Click a terminal pane first, or launch an agent.', 'error')
      return
    }
    sendToPty(target.id, value)
    setText('')
  }

  const enhance = async (): Promise<void> => {
    if (!text.trim() || enhancing) return
    setEnhancing(true)
    try {
      setText(await window.api.voice.enhance(text.trim()))
      toast('Prompt rewritten — review it, then send.', 'success')
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setEnhancing(false)
    }
  }

  return (
    <div className="shrink-0 rounded-xl border border-line bg-panel transition-colors focus-within:border-accent/60">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
        placeholder="Tell the agent what to do next…"
        aria-label="Message to the active pane"
        className="block max-h-[132px] min-h-10 w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-sm leading-relaxed text-fg placeholder:text-fg-faint focus:outline-none"
      />
      <div className="flex items-center gap-1.5 px-2 pb-2">
        <span
          className={cn(
            'flex h-6 max-w-[45%] items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-2xs',
            target ? 'text-fg-muted' : 'text-fg-faint'
          )}
          title="Messages go to the pane you clicked last"
        >
          {target && <AgentIcon agentId={target.agentId} size={11} />}
          <span className="truncate">{target ? target.title : 'Click a pane to choose who gets this'}</span>
        </span>
        <span className="hidden items-center gap-1 text-2xs text-fg-faint lg:flex">
          <Kbd>Enter</Kbd> send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line · hold <Kbd>{pttKey}</Kbd> to talk
        </span>
        <span className="flex-1" />
        <IconButton label={recording ? 'Stop dictation' : 'Dictate'} tipSide="top" onClick={toggleRecording} className={recording ? 'bg-err/15 text-err' : undefined}>
          <Mic size={15} />
        </IconButton>
        <IconButton label="Enhance Prompt — rewrite into a clear brief" tipSide="top" onClick={() => void enhance()} disabled={!text.trim() || enhancing}>
          {enhancing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        </IconButton>
        <Tip label="Send · Enter" side="top">
          <button
            aria-label="Send"
            onClick={send}
            disabled={!text.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-[#1d4ed8] bg-linear-to-b from-[#4c8df6] to-[#2563eb] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_2px_rgba(0,0,0,0.45)] transition-all hover:from-[#5d9bff] hover:to-[#3071f0] active:translate-y-px disabled:border-line-strong disabled:from-hover disabled:to-hover disabled:text-fg-faint disabled:shadow-none"
          >
            <ArrowUp size={15} strokeWidth={2.5} />
          </button>
        </Tip>
      </div>
    </div>
  )
}
