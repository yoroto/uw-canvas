import { isActiveCourse } from '../../shared/schedule/courseMatch'
import type { Course } from '../../shared/types'
import type { CanvasClient } from './CanvasClient'

/** Courses worth showing: published, named, and not hidden by a date restriction. */
export async function listActiveCourses(client: CanvasClient): Promise<(Course & { name: string })[]> {
  return (await listCourses(client)).filter(isActiveCourse)
}

// GET /api/v1/courses: the current user's courses (active by default).
export function listCourses(client: CanvasClient): Promise<Course[]> {
  return client.getAll<Course>('/api/v1/courses', { 'include[]': ['term'] })
}
