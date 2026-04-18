interface Window {
  gtag: (...args: unknown[]) => void
  dataLayer: Record<string, unknown>[]
  /** Align with Mercury: suppress refresh/session checks during navigational logout */
  __isLoggingOut?: boolean
}
