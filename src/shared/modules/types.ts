// The slice of a course's Canvas modules that the Daily view needs.

export interface ModuleItemView {
  id: string
  title: string
  /** Assignment, Quiz, Discussion, Page, File, ExternalUrl, ExternalTool, ... */
  type: string
  /** Where the item opens in Canvas. */
  htmlUrl: string
  /** ISO due date, when the item has one (assignments, quizzes, discussions). */
  dueAt: string | null
  position: number
  indent: number
}

export interface ModuleView {
  id: string
  name: string
  position: number
  items: ModuleItemView[]
}

export interface ModulesResult {
  /** Modules per course id. */
  courses: Record<string, ModuleView[]>
  /** Problems worth showing; modules a course does not offer to students are not errors. */
  errors: { courseId: string; message: string }[]
  fetchedAt: string
}
