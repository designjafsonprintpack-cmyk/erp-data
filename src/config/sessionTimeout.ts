// Shared constants for the configurable auto-logout (idle session timeout)
// feature. Used by both the Settings > Session Timeout page and
// IdleTimeoutGuard so the two never drift out of sync on allowed values.

export const SESSION_TIMEOUT_KEY = 'session_timeout_minutes'

// Value stored in system_settings.value is always one of these strings.
// 'never' disables the idle-logout mechanism entirely.
export const SESSION_TIMEOUT_OPTIONS = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
  { value: 'never', label: 'Never' },
] as const

export type SessionTimeoutValue = typeof SESSION_TIMEOUT_OPTIONS[number]['value']

export const SESSION_TIMEOUT_VALUES: readonly string[] = SESSION_TIMEOUT_OPTIONS.map(o => o.value)

// Matches the mechanism's previous hardcoded behavior (120 minutes), so a
// company that hasn't touched this setting yet sees no change in behavior.
export const DEFAULT_SESSION_TIMEOUT: SessionTimeoutValue = '120'

export function isValidSessionTimeout(value: unknown): value is SessionTimeoutValue {
  return typeof value === 'string' && SESSION_TIMEOUT_VALUES.includes(value)
}
