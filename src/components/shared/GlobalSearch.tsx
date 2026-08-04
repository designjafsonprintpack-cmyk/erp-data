'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Briefcase, Users, ShoppingCart, X, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatJobSizeLine } from '@/lib/utils/formatJobSize'
import { useJobThumbnails, JobThumbStrip } from '@/components/artwork/ArtworkThumb'

interface SearchResult {
  id: string
  entity_type: 'job' | 'customer' | 'sales_order'
  code: string
  title: string
  status: string
  customer_name: string
  /** Jobs only — the route enriches job rows with their dimensions. */
  size_l?: number | null
  size_w?: number | null
  size_h?: number | null
  sheet_width_in?: number | null
  sheet_height_in?: number | null
}

const ENTITY_ICONS = {
  job: Briefcase,
  customer: Users,
  sales_order: ShoppingCart,
}

const ENTITY_PATHS = {
  job: '/dashboard/jobs',
  customer: '/dashboard/customers',
  sales_order: '/dashboard/sales-orders',
}

const ENTITY_LABELS = {
  job: 'Job',
  customer: 'Customer',
  sales_order: 'Sales Order',
}

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  // A job row shows its artwork, exactly as the Jobs list and the Kanban cards
  // do — the palette's other three lines (code, customer, size) all describe
  // the box in words, and the picture is what actually tells two similar jobs
  // apart at a glance. Same batched route the lists use, so a search is one
  // extra request for at most 20 ids. Customers and sales orders keep their
  // icon; they have no artwork.
  const thumbs = useJobThumbnails(results.filter(r => r.entity_type === 'job').map(r => r.id))

  // Keyboard shortcut: ⌘K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setResults(json.data ?? [])
      setSelectedIndex(0)
    } catch { setResults([]) }
    finally { setLoading(false) }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  const navigate = (result: SearchResult) => {
    router.push(`${ENTITY_PATHS[result.entity_type]}/${result.id}`)
    setOpen(false)
    setQuery('')
    setResults([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[selectedIndex]) navigate(results[selectedIndex])
  }

  return (
    <>
      {/* Trigger — icon-only below md, where a squeezed ~150px search field is
          a worse affordance than a clear 44px button; full field at md+ */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Search"
        className={cn(
          'md:hidden w-11 h-11 flex items-center justify-center rounded-md',
          'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]',
          'hover:text-[var(--color-text-primary)] transition-colors'
        )}>
        <Search size={19} />
      </button>
      <button onClick={() => setOpen(true)}
        className={cn(
          'hidden md:flex items-center gap-2 px-3 h-8 rounded-md border w-full',
          'border-[var(--color-border)] bg-[var(--color-bg-elevated)]',
          'text-sm text-[var(--color-text-muted)] hover:border-[var(--color-accent)]',
          'transition-colors duration-150'
        )}>
        <Search size={14} />
        <span className="flex-1 text-left">Search jobs, customers…</span>
        <kbd className="text-xs border border-[var(--color-border)] rounded px-1 py-0.5 hidden lg:block">⌘K</kbd>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-0 pt-0 md:px-4 md:pt-20">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm hidden md:block" onClick={() => setOpen(false)} />
          <div className="relative w-full h-full md:h-auto flex flex-col md:max-w-2xl md:rounded-xl border-0 md:border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl animate-fade-in pt-safe md:pt-0">
            {/* Search input */}
            <div className="flex items-center gap-2 md:gap-3 px-2 md:px-4 py-2 md:py-3 border-b border-[var(--color-border)] flex-shrink-0">
              <button
                onClick={() => setOpen(false)}
                aria-label="Close search"
                className="md:hidden w-11 h-11 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] flex-shrink-0">
                <ArrowLeft size={20} />
              </button>
              <Search size={16} className="hidden md:block text-[var(--color-text-muted)] flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Search jobs, customers, sales orders…"
                className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
              />
              {loading && <div className="w-4 h-4 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin flex-shrink-0" />}
              {query && !loading && (
                <button onClick={() => { setQuery(''); setResults([]) }} aria-label="Clear search" className="w-11 h-11 md:w-auto md:h-auto flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] flex-shrink-0">
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div className="flex-1 min-h-0 md:flex-none md:max-h-96 overflow-y-auto overscroll-contain py-1">
                {results.map((result, idx) => {
                  const Icon = ENTITY_ICONS[result.entity_type] || Briefcase
                  return (
                    <button key={result.id} onClick={() => navigate(result)}
                      className={cn('w-full flex items-center gap-3 px-4 py-2 min-h-14 md:min-h-0 text-left hover:bg-[var(--color-bg-secondary)] transition-colors',
                        selectedIndex === idx && 'bg-[var(--color-bg-secondary)]')}>
                      {/* Both slots are 40px wide so the text column starts at
                          the same x on every row, whichever kind it is. 'xs'
                          (40x52) is the size the Jobs list uses for its compact
                          density — a 60x77 tile here would make five results
                          taller than the dropdown. */}
                      {result.entity_type === 'job' ? (
                        <JobThumbStrip
                          designs={thumbs[result.id]}
                          size="xs"
                          max={1}
                          fallbackName={result.title}
                        />
                      ) : (
                        <div className="w-10 flex justify-center flex-shrink-0">
                          <div className="w-8 h-8 rounded-lg bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] flex items-center justify-center">
                            <Icon size={14} className="text-[var(--color-accent)]" />
                          </div>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{result.title}</span>
                          <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-1.5 py-0.5 rounded flex-shrink-0">
                            {ENTITY_LABELS[result.entity_type]}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs font-mono text-[var(--color-text-muted)]">{result.code}</span>
                          {result.customer_name && result.entity_type !== 'customer' && (
                            <span className="text-xs text-[var(--color-text-muted)]">{result.customer_name}</span>
                          )}
                          {result.status && (
                            <span className="text-xs text-[var(--color-text-muted)] capitalize">{result.status.replace('_', ' ')}</span>
                          )}
                        </div>
                        {/* Size on its own line. Two jobs called "50g Inner &
                            Outer" for one customer are told apart by this and
                            nothing else on the row. */}
                        {formatJobSizeLine(result) && (
                          <div className="text-xs text-[var(--color-text-secondary)] mt-0.5 truncate">
                            {formatJobSizeLine(result)}
                          </div>
                        )}
                      </div>
                      <kbd className="text-xs text-[var(--color-text-muted)] hidden group-hover:block">↵</kbd>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Empty state */}
            {query.length >= 2 && results.length === 0 && !loading && (
              <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                No results for <strong className="text-[var(--color-text-primary)]">{query}</strong>
              </div>
            )}

            {/* Hints */}
            {query.length < 2 && (
              <div className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                Type to search jobs, customers, sales orders… Use ↑↓ to navigate, Enter to open.
              </div>
            )}

            {/* Footer */}
            <div className="hidden md:flex px-4 py-2 border-t border-[var(--color-border)] items-center gap-4 text-xs text-[var(--color-text-muted)]">
              <span><kbd className="border border-[var(--color-border)] rounded px-1">↑↓</kbd> Navigate</span>
              <span><kbd className="border border-[var(--color-border)] rounded px-1">↵</kbd> Open</span>
              <span><kbd className="border border-[var(--color-border)] rounded px-1">Esc</kbd> Close</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default GlobalSearch
