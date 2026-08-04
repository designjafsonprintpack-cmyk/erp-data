'use client'
import { useSyncExternalStore } from 'react'
import {
  LIST_PAGE_SIZE, PAGE_SIZE_STORAGE_KEY, normalizePageSize,
} from '@/lib/constants/pagination'

/**
 * The rows-per-page preference, shared by every list in the app.
 *
 * WHY A STORE AND NOT useState IN EACH LIST
 *   The picker sits inside <Pagination>, and the number it changes is needed by
 *   the hook that fetches the rows — two components that never meet. Threading a
 *   setter through all thirteen call sites would work until one of them was
 *   missed, which is exactly how QC ended up rendering three pagers off one
 *   another's page size. A module-level store means the picker writes and every
 *   list reads, with nothing to wire up.
 *
 * HYDRATION
 *   The server has no localStorage, so the server snapshot is always the
 *   default. React renders that first, then this store's real value swaps in on
 *   the client — the standard useSyncExternalStore pattern, and the reason
 *   getServerSnapshot returns a constant rather than reading storage.
 */

let current = LIST_PAGE_SIZE
let loaded = false
const listeners = new Set<() => void>()

function load(): void {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    current = normalizePageSize(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY))
  } catch {
    // Private mode / storage disabled — the default is a fine answer.
  }
}

function subscribe(fn: () => void): () => void {
  load()
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function getSnapshot(): number {
  load()
  return current
}

/** Constant by definition — see HYDRATION above. */
function getServerSnapshot(): number {
  return LIST_PAGE_SIZE
}

export function setListPageSize(size: number): void {
  const next = normalizePageSize(size)
  if (next === current) return
  current = next
  try { window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(next)) } catch { /* ignore */ }
  listeners.forEach(fn => fn())
}

/** Rows per page for this browser. Re-renders every list when it changes. */
export function useListPageSize(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export default useListPageSize
