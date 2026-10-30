import { useEffect, useRef, useState } from 'react'
import { RULES_BY_ID, type Zone } from '../../shared/importance/rules'
import { DEFAULT_SETTINGS, moveRule, resetSettings, toggleRule, type RuleSetting } from '../../shared/importance/settings'

interface Props {
  settings: readonly RuleSetting[]
  onChange: (settings: RuleSetting[]) => void
}

const ZONES: { zone: Zone; title: string }[] = [
  { zone: 'toDo', title: 'To do' },
  { zone: 'turnedIn', title: 'Turned in' }
]

export function ImportanceFilter({ settings, onChange }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
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

  const enabledCount = settings.filter((s) => s.enabled).length
  const isDefault = JSON.stringify(settings) === JSON.stringify(DEFAULT_SETTINGS)

  return (
    <div className="filter" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Importance rules ({enabledCount}/{settings.length}) ▾
      </button>
      {open && (
        <div className="popover wide" role="dialog" aria-label="Importance rules">
          <p className="hint">Higher rules rank first. Unchecked rules are skipped; their items stay listed, ordered by due date.</p>
          {ZONES.map(({ zone, title }) => {
            const group = settings.filter((s) => RULES_BY_ID.get(s.id)?.zone === zone)
            return (
              <div key={zone}>
                <h3>{title}</h3>
                <ul>
                  {group.map((s, i) => {
                    const rule = RULES_BY_ID.get(s.id)
                    if (!rule) return null
                    return (
                      <li key={s.id} className="rule">
                        <label title={rule.description}>
                          <input type="checkbox" checked={s.enabled} onChange={() => onChange(toggleRule(settings, s.id))} />
                          <span>
                            {rule.label}
                            <span className="hint rule-desc">{rule.description}</span>
                          </span>
                        </label>
                        <span className="move">
                          <button aria-label={`Move ${rule.label} up`} disabled={i === 0} onClick={() => onChange(moveRule(settings, s.id, -1))}>
                            ▲
                          </button>
                          <button
                            aria-label={`Move ${rule.label} down`}
                            disabled={i === group.length - 1}
                            onClick={() => onChange(moveRule(settings, s.id, 1))}
                          >
                            ▼
                          </button>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
          <div className="popover-actions">
            <button onClick={() => onChange(resetSettings())} disabled={isDefault}>
              Reset to default
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
