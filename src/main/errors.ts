import type { ErrorCode } from '../shared/types'

export class CanvasError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'CanvasError'
  }
}
