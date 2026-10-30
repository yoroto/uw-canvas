import { useEffect, useRef, useState } from 'react'
import type { CourseOption } from '../../shared/assignments/courses'

interface Props {
  courses: CourseOption[]
  hidden: ReadonlySet<string>
  onChange: (hidden: Set<string>) => void
}

export function CourseFilter({ courses, hidden, onChange }: Props): React.JSX.Element {
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

  const selected = courses.filter((c) => !hidden.has(c.id)).length

  const toggle = (id: string): void => {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="filter" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Courses ({selected}/{courses.length}) ▾
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Filter by course">
          <div className="popover-actions">
            <button onClick={() => onChange(new Set())} disabled={hidden.size === 0}>
              Select all
            </button>
            <button onClick={() => onChange(new Set(courses.map((c) => c.id)))} disabled={selected === 0}>
              Deselect all
            </button>
          </div>
          <ul>
            {courses.map((c) => (
              <li key={c.id}>
                <label>
                  <input type="checkbox" checked={!hidden.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="swatch" style={{ '--h': c.hue } as React.CSSProperties} />
                  {c.name}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
