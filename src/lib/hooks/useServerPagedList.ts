'use client'
import { useCallback, useRef, useState } from 'react'
import { toast } from '@/components/ui/Toast'
import { LIST_PAGE_SIZE } from '@/components/ui/Pagination'

/**
 * Server-side paging for the operational list pages.
 *
 * Those pages used to fetch the most recent 200 rows on the server and filter
 * them in the browser. Page 201 was simply unreachable, and the cap was
 * invisible — the list just ended. This moves both the filter and the page
 * into the query, so a list can be read to the end however long it gets.
 *
 * The first page still comes from the server component, so nothing flashes
 * empty on load; this hook only takes over from the first interaction.
 *
 * Local mutations (create / status change) keep working the way they did:
 * `setRows` is exposed, and `reload()` re-fetches the current page when the
 * change is one the server has to re-sort.
 */
export function useServerPagedList<T>(opts: {
  endpoint: string
  initialRows: T[]
  initialTotal: number
  /** Extra query params for the current filter. Rebuilt on every fetch. */
  params?: () => Record<string, string>
  pageSize?: number
  errorMessage?: string
}) {
  const { endpoint, initialRows, initialTotal, pageSize = LIST_PAGE_SIZE } = opts
  const [rows, setRows] = useState<T[]>(initialRows)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // Filters change faster than the network answers. Without this, tabbing
  // quickly leaves whichever request happened to land last on screen, which
  // may not be the tab the user is now looking at.
  const requestId = useRef(0)

  const fetchPage = useCallback(async (pageNo: number, extra?: Record<string, string>) => {
    const mine = ++requestId.current
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(pageNo), limit: String(pageSize) })
      for (const [k, v] of Object.entries(extra ?? opts.params?.() ?? {})) {
        if (v) qs.set(k, v)
      }
      const res = await fetch(`${endpoint}?${qs}`)
      const json = await res.json()
      if (mine !== requestId.current) return          // a newer request won
      if (!res.ok) throw new Error(json?.error || 'Request failed')
      // The list shrank under us (someone else deleted rows, or a bookmarked
      // ?page= is now past the end). Land on page 1 rather than a blank list.
      if (json?.outOfRange && pageNo > 1) { requestId.current--; return fetchPage(1, extra) }
      setRows((json.data ?? []) as T[])
      setTotal(json.total ?? 0)
      setPage(pageNo)
    } catch {
      if (mine === requestId.current) toast.error(opts.errorMessage ?? 'Failed to load')
    } finally {
      if (mine === requestId.current) setLoading(false)
    }
    // opts.params is read through the ref-free closure on purpose — callers
    // pass a fresh function every render, and depending on it would rebuild
    // this callback constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, pageSize])

  return {
    rows, setRows, total, setTotal, page, loading, pageSize,
    /** Jump to a page with the current filter. */
    goToPage: (p: number, extra?: Record<string, string>) => fetchPage(p, extra),
    /** Filter changed — always land on page 1. */
    applyFilter: (extra?: Record<string, string>) => fetchPage(1, extra),
    /** Re-fetch the page currently on screen. */
    reload: (extra?: Record<string, string>) => fetchPage(page, extra),
  }
}

/**
 * Every row the current filter selects, not just the page on screen.
 *
 * Export has to keep meaning "export what I filtered to". Once a list is
 * server-paged, the rows in memory are one page, so Export would quietly
 * shrink to 50 rows. This walks the pages instead. Bounded by the filtered
 * count, and capped so a mis-click can't pull a hundred thousand rows.
 */
export async function fetchAllPages<T>(
  endpoint: string,
  params: Record<string, string> = {},
  { chunk = 200, max = 5000 }: { chunk?: number; max?: number } = {}
): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; out.length < max; page++) {
    const qs = new URLSearchParams({ page: String(page), limit: String(chunk) })
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
    const res = await fetch(`${endpoint}?${qs}`)
    if (!res.ok) break
    const json = await res.json()
    const rows = (json.data ?? []) as T[]
    out.push(...rows)
    if (rows.length < chunk || out.length >= (json.total ?? 0)) break
  }
  return out
}

export default useServerPagedList
