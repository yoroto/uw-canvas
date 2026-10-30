import type { AssignmentView } from './types'

export interface CourseOption {
  id: string
  name: string
  /** 0-360, used for the course's color. */
  hue: number
}

const GOLDEN_ANGLE = 137.508

/**
 * Unique courses from the loaded assignments, sorted by name. Hues are spread
 * by the golden angle so neighbours in the list look clearly different.
 * Depends only on the full list, so filtering never changes a course's color.
 */
export function courseOptions(items: AssignmentView[]): CourseOption[] {
  const byId = new Map<string, string>()
  for (const i of items) byId.set(i.courseId, i.courseName)
  return [...byId]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((c, index) => ({ ...c, hue: Math.round((index * GOLDEN_ANGLE + 210) % 360) }))
}

/** `hidden` holds the deselected course ids, so courses that appear later are shown by default. */
export function filterByCourses(items: AssignmentView[], hidden: ReadonlySet<string>): AssignmentView[] {
  return hidden.size === 0 ? items : items.filter((i) => !hidden.has(i.courseId))
}
