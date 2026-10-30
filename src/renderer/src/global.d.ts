/// <reference types="vite/client" />
import type { CanvasBridge } from '../../shared/types'

declare global {
  interface Window {
    canvas: CanvasBridge
  }
}
