import { useEffect, useRef, useState } from 'react'
import { GRADE_SORTS, type GradeSort } from '../../shared/grades/grades'

interface Props {
  value: GradeSort
  onChange: (sort: GradeSort) => void
}

export function GradeSortFilter({ value, onChange }: Props): React.JSX.Element {
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

  const current = GRADE_SORTS.find((s) => s.key === value)

  return (
    <div className="filter" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Sort: {current?.label} ▾
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Sort grades by">
          <p className="hint">Most recent at the top.</p>
          <ul>
            {GRADE_SORTS.map((s) => (
              <li key={s.key}>
                <label>
                  <input
                    type="radio"
                    name="grade-sort"
                    checked={value === s.key}
                    onChange={() => {
                      onChange(s.key)
                      setOpen(false)
                    }}
                  />
                  <span>
                    {s.label}
                    <span className="hint rule-desc">{s.description}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
