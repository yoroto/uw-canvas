import { useEffect, useRef, useState } from 'react'
import type { FeedInfo } from '../../shared/daily/types'

interface Props {
  feeds: FeedInfo[]
  onFeedsChange: (feeds: FeedInfo[]) => void
  /** Called after the main process dropped its cached downloads. */
  onRefreshed: () => void
}

/** Button + popover to add or remove calendar feeds (webcal:// or https:// links). */
export function FeedsManager({ feeds, onFeedsChange, onRefreshed }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const add = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNote(null)
    const res = await window.canvas.feeds.add(name, url)
    setBusy(false)
    if (!res.ok) return setError(res.error.message)
    onFeedsChange([...feeds, res.data.feed])
    setNote(`Added “${res.data.feed.name}”: ${res.data.upcomingCount} event${res.data.upcomingCount === 1 ? '' : 's'} in the next 30 days.`)
    setUrl('')
    setName('')
  }

  const remove = async (id: string): Promise<void> => {
    setBusy(true)
    setError(null)
    setNote(null)
    const res = await window.canvas.feeds.remove(id)
    setBusy(false)
    if (!res.ok) return setError(res.error.message)
    onFeedsChange(res.data)
  }

  const refresh = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const res = await window.canvas.feeds.refresh()
    setBusy(false)
    if (!res.ok) return setError(res.error.message)
    setNote('Feeds will be downloaded again.')
    onRefreshed()
  }

  return (
    <div className="filter" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Calendars ({feeds.length}) ▾
      </button>
      {open && (
        <div className="popover wide" role="dialog" aria-label="Calendar feeds">
          <h3>Calendar feeds</h3>
          {feeds.length === 0 && <p className="hint">No feeds yet. Paste a webcal:// or https:// link below.</p>}
          <ul className="feed-list">
            {feeds.map((f) => (
              <li key={f.id}>
                <span className="swatch" style={{ background: f.color }} />
                <span className="feed-name">
                  {f.name}
                  <span className="hint rule-desc">{f.host}</span>
                </span>
                <button aria-label={`Remove ${f.name}`} title="Remove" disabled={busy} onClick={() => void remove(f.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <form className="feed-form" onSubmit={(e) => void add(e)}>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="webcal://… or https://…"
              aria-label="Calendar feed link"
              autoComplete="off"
              spellCheck={false}
            />
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Feed name" />
            <div className="popover-actions">
              <button type="submit" className="primary" disabled={busy || url.trim() === ''}>
                {busy ? 'Working…' : 'Add'}
              </button>
              <button type="button" onClick={() => void refresh()} disabled={busy || feeds.length === 0}>
                Refresh feeds
              </button>
            </div>
          </form>
          {error && <p className="error">{error}</p>}
          {note && <p className="hint">{note}</p>}
          <p className="hint">Links are saved only on this computer, in config/calendar-feeds.json (not committed to git).</p>
        </div>
      )}
    </div>
  )
}
