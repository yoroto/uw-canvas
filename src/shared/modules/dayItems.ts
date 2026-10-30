import { dayRange } from '../daily/assignments'
import type { ModuleItemView, ModuleView } from './types'

export interface DayModuleItem {
  item: ModuleItemView
  moduleName: string
  due: Date
}

/**
 * The module items whose own due date falls on `date` (YYYY-MM-DD, local),
 * soonest first. An item that sits in several modules is listed once.
 */
export function itemsDueOnDay(modules: readonly ModuleView[], date: string): DayModuleItem[] {
  const { from, to } = dayRange(date)
  const f = from.getTime()
  const t = to.getTime()
  const seen = new Set<string>()
  const out: (DayModuleItem & { modulePosition: number })[] = []

  for (const m of [...modules].sort((a, b) => a.position - b.position)) {
    for (const item of m.items) {
      if (!item.dueAt || seen.has(item.id)) continue
      const due = new Date(item.dueAt)
      if (due.getTime() < f || due.getTime() >= t) continue
      seen.add(item.id)
      out.push({ item, moduleName: m.name, due, modulePosition: m.position })
    }
  }

  return out
    .sort((a, b) => a.due.getTime() - b.due.getTime() || a.modulePosition - b.modulePosition || a.item.position - b.item.position || a.item.title.localeCompare(b.item.title))
    .map(({ item, moduleName, due }) => ({ item, moduleName, due }))
}

const TYPE_LABELS: Record<string, string> = {
  Assignment: 'Assignment',
  Quiz: 'Quiz',
  Discussion: 'Discussion',
  Page: 'Page',
  File: 'File',
  ExternalUrl: 'Link',
  ExternalTool: 'Tool'
}

/** Short label for a module item's type. */
export function moduleItemTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}
