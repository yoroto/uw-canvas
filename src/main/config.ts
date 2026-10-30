export const CANVAS_ORIGIN = 'https://canvas.uw.edu'
export const CANVAS_HOST = new URL(CANVAS_ORIGIN).host

// Persistent partition: cookies survive restarts, isolated from any other session.
export const SESSION_PARTITION = 'persist:canvas'
