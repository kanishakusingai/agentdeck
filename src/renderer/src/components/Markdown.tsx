import { Fragment, type ReactNode } from 'react'

// A small, safe markdown renderer (no HTML injection): headings, lists,
// code fences, inline code, bold and links rendered as plain text.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('`')) {
      out.push(
        <code key={`${keyBase}-${i++}`} className="rounded bg-raised px-1 py-px font-mono text-[0.92em] text-fg">
          {token.slice(1, -1)}
        </code>
      )
    } else {
      out.push(
        <strong key={`${keyBase}-${i++}`} className="font-semibold text-fg">
          {token.slice(2, -2)}
        </strong>
      )
    }
    last = m.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function blocks(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const lines = text.split('\n')
  let para: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let k = 0
  const flushPara = (): void => {
    if (para.length) out.push(<p key={`${keyBase}-p${k++}`}>{inline(para.join(' '), `${keyBase}-${k}`)}</p>)
    para = []
  }
  const flushList = (): void => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    out.push(
      <Tag key={`${keyBase}-l${k++}`} className={list.ordered ? 'list-decimal pl-5' : 'list-disc pl-5'}>
        {list.items.map((it, i) => (
          <li key={i} className="my-0.5">
            {inline(it, `${keyBase}-li${k}-${i}`)}
          </li>
        ))}
      </Tag>
    )
    list = null
  }
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (bullet || numbered) {
      flushPara()
      const ordered = Boolean(numbered)
      if (list && list.ordered !== ordered) flushList()
      if (!list) list = { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1])
    } else if (heading) {
      flushPara()
      flushList()
      out.push(
        <p key={`${keyBase}-h${k++}`} className="font-semibold text-fg">
          {inline(heading[1], `${keyBase}-h${k}`)}
        </p>
      )
    } else if (!line.trim()) {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return out
}

export function Markdown({ text }: { text: string }) {
  const parts = text.split(/```/)
  return (
    <div className="flex flex-col gap-2.5 text-sm leading-relaxed text-fg/90 [user-select:text]">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="overflow-x-auto rounded-md border border-line bg-surface p-3 font-mono text-xs leading-relaxed text-fg">
            {part.replace(/^[\w-]*\n/, '')}
          </pre>
        ) : (
          <Fragment key={i}>{blocks(part, `b${i}`)}</Fragment>
        )
      )}
    </div>
  )
}
