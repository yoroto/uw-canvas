import type { Course } from '../../shared/types'
import type { CanvasClient } from './CanvasClient'

/** Courses worth showing: published, named, and not hidden by a date restriction. */
export async function listActiveCourses(client: CanvasClient): Promise<(Course & { name: string })[]> {
  return (await listCourses(client)).filter(
    (c): c is Course & { name: string } => !!c.name && !c.access_restricted_by_date && c.workflow_state === 'available'
  )
}

// GET /api/v1/courses: the current user's courses (active by default).
export function listCourses(client: CanvasClient): Promise<Course[]> {
  return client.getAll<Course>('/api/v1/courses', { 'include[]': ['term'] })
}
