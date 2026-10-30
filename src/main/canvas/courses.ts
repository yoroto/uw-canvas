import type { Course } from '../../shared/types'
import type { CanvasClient } from './CanvasClient'

// GET /api/v1/courses: the current user's courses (active by default).
export function listCourses(client: CanvasClient): Promise<Course[]> {
  return client.getAll<Course>('/api/v1/courses', { 'include[]': ['term'] })
}
