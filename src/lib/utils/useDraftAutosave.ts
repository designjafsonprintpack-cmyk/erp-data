'use client'
import { useEffect, useRef, useState } from 'react'

// Debounced localStorage draft persistence for long forms (Quotation, New
// Job). Exists because the app has a 30-minute idle-session timeout and,
// before this, zero autosave — someone interrupted mid-quotation could lose
// everything. This never talks to the server; it's purely a local safety
// net, cleared once the form actually saves successfully.
interface DraftAutosaveOptions<T> {
  key: string
  value: T
  enabled?: boolean
  delayMs?: number
  // Cheap heuristic for "nothing worth saving yet" — checking one or two
  // required fields is enough, doesn't need to be a deep-equality check.
  isBlank: (v: T) => boolean
}

export function useDraftAutosave<T>({ key, value, enabled = true, delayMs = 1500, isBlank }: DraftAutosaveOptions<T>) {
  const [draftAvailable, setDraftAvailable] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)
  const checkedRef = useRef(false)

  // Check once, on mount, for a pre-existing draft — before this effect's
  // sibling below starts overwriting it with the freshly-mounted blank form.
  useEffect(() => {
    if (!enabled || checkedRef.current) return
    checkedRef.current = true
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.value !== undefined && !isBlank(parsed.value)) {
          setDraftAvailable(true)
          setDraftSavedAt(parsed.savedAt ?? null)
        }
      }
    } catch {
      // Corrupt or inaccessible draft — treat as no draft, not an error.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  useEffect(() => {
    if (!enabled || isBlank(value)) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ value, savedAt: new Date().toISOString() }))
      } catch {
        // Storage full/unavailable (private browsing etc.) — fail silently,
        // autosave is a bonus, not something to interrupt the user over.
      }
    }, delayMs)
    return () => clearTimeout(t)
  }, [key, value, enabled, delayMs])

  const restoreDraft = (): T | null => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      return JSON.parse(raw)?.value ?? null
    } catch {
      return null
    }
  }

  const discardDraft = () => {
    try { localStorage.removeItem(key) } catch { /* noop */ }
    setDraftAvailable(false)
  }

  const clearDraft = () => {
    try { localStorage.removeItem(key) } catch { /* noop */ }
  }

  return { draftAvailable, draftSavedAt, restoreDraft, discardDraft, clearDraft }
}
