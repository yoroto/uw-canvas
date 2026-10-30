import type { Course } from '../types'

export interface CourseRef {
  id: string
  name: string
}

/** Courses worth showing: published, named, and not hidden by a date restriction. */
export function isActiveCourse(c: Course): c is Course & { name: string } {
  return !!c.name && !c.access_restricted_by_date && c.workflow_state === 'available'
}

/** Lowercase words only: "Health & Wellness" and "Health and Wellness" become the same text. */
export function normaliseName(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export interface CourseMatch {
  course: CourseRef
  /** Several courses fit equally well; the shortest name was taken. */
  ambiguous: boolean
}

/**
 * Finds the Canvas course for a class block. The text looked for is the
 * `courseNames` entry for the title (for example Precalc -> Precalculus), or the
 * title itself. A course fits when its name contains that text as whole words;
 * an exact name beats a name that starts with it, which beats one that merely
 * contains it. Ties go to the shortest name, then the lowest id.
 */
export function matchCourse(title: string, courses: readonly CourseRef[], courseNames: Readonly<Record<string, string>> = {}): CourseMatch | null {
  const needle = normaliseName(courseNames[title] ?? title)
  if (!needle) return null

  const ranked = courses
    .map((course) => {
      const name = normaliseName(course.name)
      const rank = name === needle ? 0 : name.startsWith(`${needle} `) ? 1 : ` ${name} `.includes(` ${needle} `) ? 2 : -1
      return { course, name, rank }
    })
    .filter((c) => c.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.name.length - b.name.length || a.course.id.localeCompare(b.course.id, undefined, { numeric: true }))

  if (ranked.length === 0) return null
  return { course: ranked[0].course, ambiguous: ranked.filter((c) => c.rank === ranked[0].rank).length > 1 }
}
