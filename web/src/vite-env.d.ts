/// <reference types="vite/client" />

import type { PostHog } from 'posthog-js'

interface ImportMetaEnv {
  readonly VITE_POSTHOG_KEY?: string
  readonly VITE_POSTHOG_API_HOST?: string
  readonly VITE_POSTHOG_UI_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    heap: {
      envId?: string
      appid?: string
      onReady?: (callback: () => void) => void
      getSessionId?: () => string
      identify?: (identity: string) => void
      getIdentity?: () => string | null
      addUserProperties?: (properties: Record<string, unknown>) => void
      [key: string]: unknown
    }
    heapReadyCb: unknown[]
    posthog?: PostHog
  }
}

export {}
