'use client'
import { useState, useEffect } from 'react'
import { Upload, CheckCircle2, Image as ImageIcon, Plus, Trash2, ExternalLink, Filter, MessageCircle, X, Maximize2, Sparkles, AlertTriangle, List, LayoutGrid, Stamp } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { ARTWORK_ACCEPT, ARTWORK_ACCEPT_LABEL, ARTWORK_REJECT_MESSAGE, isAcceptedArtworkFile } from '@/lib/utils/artworkFileTypes'
import { Modal } from '@/components/ui/Modal'
import { formatDateTime, formatTimeAgo } from '@/lib/utils/format'
import { createSupabaseClient } from '@/lib/supabase/client'
import { uploadFile, getSignedUrl } from '@/lib/utils/uploadFile'
import { ArtworkThumb, useArtworkThumbnails } from '@/components/artwork/ArtworkThumb'
import { MarkupOverlay, markNumber } from '@/components/artwork/MarkupOverlay'
import type { MarkupShape } from '@/lib/schemas/publicToken'
import { ARTWORK_STATUS_CONFIG, ARTWORK_STATUS_TRANSITIONS, type ArtworkStatus } from '@/modules/artwork/types/artwork.types'
import { Pagination } from '@/components/ui/Pagination'
import { useServerPagedList } from '@/lib/hooks/useServerPagedList'

interface ArtworkComment {
  id: string; author_type: 'staff' | 'customer'; author_name: string | null
  comment_text: string; position_x: number | null; position_y: number | null
  // 'emboss' = the customer marked this as something to be embossed
  // (migration 089). Optional so rows fetched before it existed still parse.
  comment_type?: 'comment' | 'emboss'
  // Drawn markup from the approval page (migration 090); NULL on older rows,
  // which stay plain numbered pins.
  shape?: MarkupShape | null
  resolved: boolean; created_at: string
  users?: { full_name: string } | null
}
interface Artwork {
  id: string; job_id: string; version: number; file_name: string; file_url: string
  /** Which DESIGN this belongs to (migration 124). Legacy rows are 1. */
  design_no?: number | null
  design_label?: string | null
  file_size: number | null; file_type: string | null; designer_notes: string | null
  status: ArtworkStatus; is_production_ready: boolean; approved_at: string | null; created_at: string
  approver_name?: string | null; approver_email?: string | null; decided_at?: string | null
  ai_preflight_status?: 'pass' | 'warning' | 'fail' | null
  ai_preflight_summary?: string | null
  ai_preflight_issues?: { severity: string; title: string; detail: string }[] | null
  jobs?: { job_number: string; job_title: string; customers?: { name: string } | null } | null
}
interface Job { id: string; job_number: string; job_title: string; customers?: { name: string } | null }

/** Remembers the list/thumbnail choice between visits. */
const ARTWORK_VIEW_KEY = 'jafson.artwork.view'

const inputCls = 'w-full h-11 md:h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ArtworkClient({ initialArtworks, initialTotal, jobs, companyId, commentSummary }: { initialArtworks: Artwork[]; initialTotal: number; jobs: Job[]; companyId: string; commentSummary: Record<string, { total: number; unresolvedCustomer: boolean }> }) {
  const [filterJob, setFilterJob] = useState('')

  // The job filter runs in the query now, so it reaches every artwork version
  // rather than the newest 200 this page happened to load.
  const list = useServerPagedList<Artwork>({
    endpoint: '/api/v1/artwork',
    initialRows: initialArtworks,
    initialTotal,
    errorMessage: 'Failed to load artwork',
  })
  const artworks = list.rows
  const setArtworks = list.setRows

  const changeJob = (v: string) => { setFilterJob(v); list.applyFilter({ job_id: v }) }
  const [uploadModal, setUploadModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [commentsModal, setCommentsModal] = useState<Artwork | null>(null)
  const [commentsModalImageUrl, setCommentsModalImageUrl] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, ArtworkComment[]>>({})
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const [fullscreenPins, setFullscreenPins] = useState(false)
  const [preflightLoading, setPreflightLoading] = useState<string | null>(null)
  const [preflightModal, setPreflightModal] = useState<Artwork | null>(null)
  const [form, setForm] = useState({
    job_id: '', file_name: '', file_url: '', file_size: '', file_type: '', designer_notes: '',
  })

  // List vs thumbnail grid. Persisted because it is a working preference, not
  // a per-visit choice — a designer scanning artwork wants the grid every time.
  const [view, setView] = useState<'list' | 'grid'>('list')
  useEffect(() => {
    const saved = localStorage.getItem(ARTWORK_VIEW_KEY)
    if (saved === 'grid' || saved === 'list') setView(saved)
  }, [])
  const changeView = (v: 'list' | 'grid') => {
    setView(v)
    localStorage.setItem(ARTWORK_VIEW_KEY, v)
  }

  // Already filtered by the query — this is just the name the rest of the
  // component uses.
  const filtered = artworks

  // One batched signing request for every previewable file on screen.
  const thumbs = useArtworkThumbnails(filtered)

  const grouped = filtered.reduce((acc, art) => {
    const key = art.job_id
    if (!acc[key]) acc[key] = []
    acc[key].push(art)
    return acc
  }, {} as Record<string, Artwork[]>)

  // Grouping happens within the page. Rows come back newest-first, so a job's
  // versions are next to each other; a job whose versions straddle a page
  // boundary simply shows its header on both, which is better than a cap.
  const groupEntries = Object.entries(grouped)

  const pickFile = (file: File | null) => {
    setSelectedFile(file)
    if (file) {
      const ext = file.name.split('.').pop()?.toUpperCase() || ''
      setForm(p => ({ ...p, file_name: file.name, file_type: ext, file_size: String(file.size) }))
    }
  }

  const viewFile = async (path: string) => {
    const supabase = createSupabaseClient()
    const url = await getSignedUrl(supabase, 'artwork', path)
    if (!url) { toast.error('Could not open file'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const upload = async () => {
    if (!form.job_id || !selectedFile) {
      toast.error('Job and a file are required'); return
    }
    if (!isAcceptedArtworkFile(selectedFile.name, selectedFile.type)) {
      toast.error(ARTWORK_REJECT_MESSAGE); return
    }
    setLoading(true)
    try {
      const supabase = createSupabaseClient()
      const { path, error: uploadErr } = await uploadFile(
        supabase, 'artwork', companyId, `${form.job_id}/${Date.now()}-${selectedFile.name}`, selectedFile
      )
      if (uploadErr || !path) throw new Error(uploadErr || 'Upload failed')

      const res = await fetch('/api/v1/artwork', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, file_url: path, file_size: form.file_size ? parseInt(form.file_size) : null }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      // Attach job info for display
      const job = jobs.find(j => j.id === form.job_id)
      setArtworks(prev => [{ ...data, jobs: job ? { job_number: job.job_number, job_title: job.job_title, customers: job.customers } : null }, ...prev])
      setUploadModal(false)
      setForm({ job_id: '', file_name: '', file_url: '', file_size: '', file_type: '', designer_notes: '' })
      setSelectedFile(null)
      toast.success(`Artwork v${data.version} added`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const changeStatus = async (id: string, status: ArtworkStatus) => {
    try {
      const res = await fetch(`/api/v1/artwork/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      setArtworks(prev => prev.map(a => {
        if (a.id === id) return { ...a, status, is_production_ready: status === 'approved' }
        // Approving one version supersedes any other approved version of the same job
        if (status === 'approved' && a.job_id === prev.find(x => x.id === id)?.job_id && a.status === 'approved') {
          return { ...a, status: 'archived' as ArtworkStatus, is_production_ready: false }
        }
        return a
      }))
      toast.success(`Status changed to "${ARTWORK_STATUS_CONFIG[status].label}"`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
  }

  /** How many designs a job carries — decides whether a design is named at all
   *  on the row and the tile. */
  const designCountForJob = (jobId: string) =>
    new Set(artworks.filter(a => a.job_id === jobId).map(a => a.design_no ?? 1)).size

  // Prefer the fully-loaded comment list (accurate resolved state, updates
  // live) once the panel's been opened; until then, fall back to the
  // upfront server-computed summary so the badge is correct from page load,
  // not just after the first click.
  const commentCount = (artworkId: string) =>
    comments[artworkId] ? comments[artworkId].length : (commentSummary[artworkId]?.total || 0)
  const hasUnresolvedCustomerComment = (artworkId: string) =>
    comments[artworkId]
      // Emboss marks are never resolved — they must not keep the badge red.
      ? comments[artworkId].some(c => c.author_type === 'customer' && !c.resolved && c.comment_type !== 'emboss')
      : !!commentSummary[artworkId]?.unresolvedCustomer

  const openCommentsModal = async (art: Artwork) => {
    setCommentsModal(art)
    setCommentsModalImageUrl(null)
    setNewComment('')
    const loadImage = async () => {
      const supabase = createSupabaseClient()
      const url = await getSignedUrl(supabase, 'artwork', art.file_url)
      setCommentsModalImageUrl(url)
    }
    if (!comments[art.id]) {
      setCommentsLoading(true)
      try {
        const res = await fetch(`/api/v1/artwork/${art.id}/comments`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Could not load comments')
        setComments(prev => ({ ...prev, [art.id]: json.data }))
      } catch (e: any) { toast.error(e.message || 'Could not load comments') }
      finally { setCommentsLoading(false) }
    }
    loadImage()
  }

  const addComment = async (artworkId: string) => {
    if (!newComment.trim()) return
    setAddingComment(true)
    try {
      const res = await fetch(`/api/v1/artwork/${artworkId}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_text: newComment.trim() }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setComments(prev => ({ ...prev, [artworkId]: [...(prev[artworkId] || []), data] }))
      setNewComment('')
    } catch (e: any) { toast.error(e.message || 'Failed to add comment') }
    finally { setAddingComment(false) }
  }

  const toggleResolve = async (artworkId: string, commentId: string, resolved: boolean) => {
    try {
      const res = await fetch(`/api/v1/artwork-comments/${commentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved }),
      })
      if (!res.ok) throw new Error()
      setComments(prev => ({
        ...prev,
        [artworkId]: (prev[artworkId] || []).map(c => c.id === commentId ? { ...c, resolved } : c),
      }))
    } catch { toast.error('Failed') }
  }

  const deleteArtwork = async (id: string) => {
    try {
      await fetch(`/api/v1/artwork/${id}`, { method: 'DELETE' })
      setArtworks(prev => prev.filter(a => a.id !== id))
      toast.success('Artwork deleted')
    } catch { toast.error('Failed') }
  }

  const runPreflight = async (art: Artwork) => {
    setPreflightLoading(art.id)
    try {
      const res = await fetch(`/api/v1/artwork/${art.id}/ai-preflight`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Pre-flight check failed'); return }
      const updated = { ...art, ...json.data }
      setArtworks(prev => prev.map(a => a.id === art.id ? updated : a))
      setPreflightModal(updated)
    } catch { toast.error('Pre-flight check failed') }
    finally { setPreflightLoading(null) }
  }

  const PREFLIGHT_CFG: Record<string, { color: string; label: string }> = {
    pass:    { color: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]', label: 'AI: Pass' },
    warning: { color: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)]', label: 'AI: Warnings' },
    fail:    { color: 'text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-danger)_20%,transparent)]', label: 'AI: Issues Found' },
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-2.5 md:gap-3">
        <select value={filterJob} onChange={e => changeJob(e.target.value)}
          className="w-full md:w-auto h-11 md:h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] transition-colors">
          <option value="">All Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
        </select>
        <div className="flex items-center gap-2.5 md:ml-auto">
          {/* List / thumbnail grid toggle */}
          <div className="flex items-center gap-1 flex-shrink-0 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-0.5">
            <button onClick={() => changeView('list')} title="List view" aria-label="List view" aria-pressed={view === 'list'}
              className={cn('w-10 h-10 md:w-8 md:h-8 flex items-center justify-center rounded-md transition-colors',
                view === 'list' ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]')}>
              <List size={15} />
            </button>
            <button onClick={() => changeView('grid')} title="Thumbnail view" aria-label="Thumbnail view" aria-pressed={view === 'grid'}
              className={cn('w-10 h-10 md:w-8 md:h-8 flex items-center justify-center rounded-md transition-colors',
                view === 'grid' ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]')}>
              <LayoutGrid size={15} />
            </button>
          </div>
          <button onClick={() => setUploadModal(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
            <Plus size={15} /> Add Artwork
          </button>
        </div>
      </div>

      {/* Grouped by job */}
      {groupEntries.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-16 text-center">
          <ImageIcon size={32} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-3" />
          <p className="text-sm font-medium text-[var(--color-text-primary)]">No artwork yet</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Add artwork files for active jobs</p>
        </div>
      ) : (
        groupEntries.map(([jobId, arts]) => {
          const job = arts[0]?.jobs
          const readyVersion = arts.find(a => a.status === 'approved')
          return (
            <div key={jobId} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
              {/* Job header */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-4 md:px-5 py-3 md:py-3.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)]">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-[var(--color-accent)] font-mono">{job?.job_number}</span>
                  <span className="text-sm text-[var(--color-text-primary)] ml-2">{job?.job_title}</span>
                  <span className="text-xs text-[var(--color-text-muted)] ml-2">{job?.customers?.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                  {readyVersion && (
                    <span className="text-xs px-2.5 py-1 rounded-full border font-medium text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)] flex items-center gap-1.5">
                      <CheckCircle2 size={11} /> v{readyVersion.version} Production Ready
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-text-muted)]">{arts.length} version{arts.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Thumbnail grid — 125 × 160 tiles, exact size at every
                  breakpoint; the row wraps rather than the tile resizing. */}
              {view === 'grid' ? (
                <div className="flex flex-wrap gap-3 md:gap-4 p-4 md:p-5">
                  {arts.map(art => (
                    <div key={art.id} className="w-[125px] flex-shrink-0">
                      <ArtworkThumb
                        url={thumbs[art.id]}
                        fileName={art.file_name}
                        fileType={art.file_type}
                        version={art.version}
                        approved={art.status === 'approved'}
                        onClick={() => viewFile(art.file_url)}
                      />
                      {designCountForJob(art.job_id) > 1 && (
                        <p className="mt-1.5 text-[11px] font-medium text-[var(--color-accent)] truncate">
                          {art.design_label || `Design ${art.design_no ?? 1}`}
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-[var(--color-text-primary)] truncate" title={art.file_name}>
                        {art.file_name}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', ARTWORK_STATUS_CONFIG[art.status].dot)} />
                        <span className="text-[11px] text-[var(--color-text-muted)] truncate">
                          {ARTWORK_STATUS_CONFIG[art.status].label}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1">
                        <button onClick={() => openCommentsModal(art)} title="Comments & markup" aria-label="Comments and markup"
                          className={cn('w-9 h-9 md:w-8 md:h-8 flex items-center justify-center rounded-md border transition-colors',
                            hasUnresolvedCustomerComment(art.id)
                              ? 'border-[color:color-mix(in_srgb,var(--color-danger)_50%,transparent)] text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)]'
                              : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]')}>
                          <MessageCircle size={13} />
                        </button>
                        <button onClick={() => deleteArtwork(art.id)} title="Delete" aria-label="Delete artwork"
                          className="w-9 h-9 md:w-8 md:h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              /* Artwork versions */
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {arts.map(art => (
                  <div key={art.id}>
                  {/* Below md the actions row cannot share a line with the file
                      info — five controls plus a select need ~420px. The row
                      stacks instead, and returns to the exact desktop layout at
                      md: [version badge] [file info, flex-1] [actions]. */}
                  <div className={cn('flex flex-col md:flex-row md:items-center gap-3 md:gap-4 px-4 md:px-5 py-3.5',
                    art.status === 'approved' && 'bg-[color:color-mix(in_srgb,var(--color-success)_3%,transparent)]')}>
                   <div className="flex items-start md:items-center gap-3 md:gap-4 flex-1 min-w-0">
                    {/* 125 × 160 preview — replaces the old 40px version chip.
                        The version number moved onto the thumbnail itself. */}
                    <ArtworkThumb
                      url={thumbs[art.id]}
                      fileName={art.file_name}
                      fileType={art.file_type}
                      version={art.version}
                      approved={art.status === 'approved'}
                      onClick={() => viewFile(art.file_url)}
                    />

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Which DESIGN (124) — only once the job really has
                            more than one, or every row in the system would
                            read "Design 1". Without it two designs of one job
                            look identical, which is half of why an approval
                            link sent on its own said nothing. */}
                        {designCountForJob(art.job_id) > 1 && (
                          <span className="text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0
                                           bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)]
                                           border-[color:color-mix(in_srgb,var(--color-accent)_25%,transparent)]
                                           text-[var(--color-accent)]">
                            {art.design_label || `Design ${art.design_no ?? 1}`}
                          </span>
                        )}
                        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{art.file_name}</span>
                        <button onClick={() => openCommentsModal(art)}
                          className={cn('text-xs px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer', ARTWORK_STATUS_CONFIG[art.status].color)}
                          title="View comments & markup">
                          <span className={cn('w-1.5 h-1.5 rounded-full', ARTWORK_STATUS_CONFIG[art.status].dot)} />
                          {ARTWORK_STATUS_CONFIG[art.status].label}
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                        {art.file_type && <span className="text-xs text-[var(--color-text-muted)] uppercase">{art.file_type}</span>}
                        <span className="text-xs text-[var(--color-text-muted)]">{formatBytes(art.file_size)}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">Uploaded {formatTimeAgo(art.created_at)}</span>
                      </div>
                      {art.designer_notes && <p className="text-xs text-[var(--color-text-secondary)] mt-1 italic">{art.designer_notes}</p>}
                      {art.approver_name && art.decided_at && (
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">
                          {ARTWORK_STATUS_CONFIG[art.status].label} by {art.approver_name}
                          {art.approver_email && ` (${art.approver_email})`} — {formatDateTime(art.decided_at)}
                        </p>
                      )}
                    </div>
                   </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-1.5 md:flex-nowrap md:flex-shrink-0">
                      <button onClick={() => viewFile(art.file_url)}
                        className="w-10 h-10 md:w-8 md:h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors">
                        <ExternalLink size={13} />
                      </button>
                      {art.ai_preflight_status ? (
                        <button onClick={() => setPreflightModal(art)}
                          className={cn('flex items-center gap-1 px-2.5 h-10 md:h-8 rounded-md border text-xs font-medium transition-colors whitespace-nowrap', PREFLIGHT_CFG[art.ai_preflight_status].color)}>
                          <Sparkles size={12} /> {PREFLIGHT_CFG[art.ai_preflight_status].label}
                        </button>
                      ) : (
                        <button onClick={() => runPreflight(art)} disabled={preflightLoading === art.id}
                          className="flex items-center gap-1 px-2.5 h-10 md:h-8 rounded-md border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors disabled:opacity-50 whitespace-nowrap">
                          <Sparkles size={12} /> {preflightLoading === art.id ? 'Checking…' : 'AI Pre-flight'}
                        </button>
                      )}
                      <button onClick={() => openCommentsModal(art)}
                        className={cn('flex items-center gap-1 px-2.5 h-10 md:h-8 rounded-md border text-xs font-medium transition-colors whitespace-nowrap',
                          hasUnresolvedCustomerComment(art.id)
                            ? 'border-[color:color-mix(in_srgb,var(--color-danger)_50%,transparent)] text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)]'
                            : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]')}>
                        <MessageCircle size={12} />
                        {commentCount(art.id) > 0 ? commentCount(art.id) : 'Comments'}
                        {hasUnresolvedCustomerComment(art.id) && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-danger)]" />
                        )}
                      </button>
                      {ARTWORK_STATUS_TRANSITIONS[art.status].length > 0 && (
                        <select value="" onChange={e => e.target.value && changeStatus(art.id, e.target.value as ArtworkStatus)}
                          className="h-10 md:h-8 px-2 rounded-md border text-xs bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border-[var(--color-border)]">
                          <option value="">Move to…</option>
                          {ARTWORK_STATUS_TRANSITIONS[art.status].map(s => (
                            <option key={s} value={s}>{ARTWORK_STATUS_CONFIG[s].label}</option>
                          ))}
                        </select>
                      )}
                      <button onClick={() => deleteArtwork(art.id)}
                        className="w-10 h-10 md:w-8 md:h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          )
        })
      )}

      <Pagination page={list.page} total={list.total} pageSize={list.pageSize}
        loading={list.loading} onPageChange={p => list.goToPage(p, { job_id: filterJob })}
        noun="artwork versions" />

      {/* Upload Modal */}
      <Modal open={uploadModal} onClose={() => setUploadModal(false)} title="Add Artwork Version" size="md"
        footer={
          <>
            <button onClick={() => setUploadModal(false)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={upload} disabled={loading || !form.job_id || !selectedFile}
              className="flex items-center gap-2 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              <Upload size={14} /> {loading ? 'Uploading…' : 'Add Artwork'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="artworkclient-1" className="text-sm font-medium text-[var(--color-text-primary)]">Job <span className="text-[var(--color-danger)]">*</span></label>
            <select id="artworkclient-1" className={inputCls} value={form.job_id} onChange={e => setForm(p => ({ ...p, job_id: e.target.value }))}>
              <option value="">Select job…</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="artworkclient-2" className="text-sm font-medium text-[var(--color-text-primary)]">File <span className="text-[var(--color-danger)]">*</span></label>
            <input id="artworkclient-2" type="file" accept={ARTWORK_ACCEPT}
              onChange={e => pickFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-[var(--color-text-primary)] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[var(--color-accent)] file:text-[var(--color-on-accent)] hover:file:bg-[var(--color-accent-hover)]" />
            <p className="text-xs text-[var(--color-text-muted)]">{ARTWORK_ACCEPT_LABEL}</p>
            {selectedFile && <p className="text-xs text-[var(--color-text-muted)]">{selectedFile.name} — {formatBytes(selectedFile.size)}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="artworkclient-3" className="text-sm font-medium text-[var(--color-text-primary)]">Designer Notes</label>
            <input id="artworkclient-3" className={inputCls} value={form.designer_notes} onChange={e => setForm(p => ({ ...p, designer_notes: e.target.value }))} placeholder="Changes made in this version…" />
          </div>
        </div>
      </Modal>

      {/* AI Pre-flight Results Modal */}
      <Modal open={!!preflightModal} onClose={() => setPreflightModal(null)} title={`AI Pre-flight — v${preflightModal?.version || ''}`} size="md">
        {preflightModal && (
          <div className="space-y-3">
            {preflightModal.ai_preflight_status && (
              <div className={cn('flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium', PREFLIGHT_CFG[preflightModal.ai_preflight_status].color)}>
                <Sparkles size={14} /> {PREFLIGHT_CFG[preflightModal.ai_preflight_status].label}
              </div>
            )}
            {preflightModal.ai_preflight_summary && (
              <p className="text-sm text-[var(--color-text-secondary)]">{preflightModal.ai_preflight_summary}</p>
            )}
            {(preflightModal.ai_preflight_issues?.length ?? 0) > 0 ? (
              <div className="space-y-2">
                {preflightModal.ai_preflight_issues!.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-md border border-[var(--color-border)]">
                    <AlertTriangle size={13} className={cn('flex-shrink-0 mt-0.5',
                      issue.severity === 'critical' ? 'text-[var(--color-danger)]' : issue.severity === 'warning' ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)]')} />
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">{issue.title}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{issue.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">No issues flagged.</p>
            )}
            <p className="text-xs text-[var(--color-text-muted)] pt-2 border-t border-[var(--color-border-subtle)]">
              Advisory only — this does not affect approval or production status.
            </p>
          </div>
        )}
      </Modal>

      {/* Comments & Markup Modal */}
      <Modal open={!!commentsModal} onClose={() => setCommentsModal(null)} title={`Comments & Markup — v${commentsModal?.version || ''}`} size="lg">
        {commentsModal && (() => {
          const list = comments[commentsModal.id] || []
          // Shapes and legacy pins share one numbering sequence — the shared
          // helper is the single source of it, so the badge on the image and
          // the number in the list can never drift apart.
          const pinNumber = (id: string) => markNumber(list, id)
          const onImage = (c: ArtworkComment) => !!c.shape || c.position_x !== null
          return (
            <div className="space-y-4">
              {/* Image with numbered pins */}
              <div className="relative bg-black rounded-lg flex items-center justify-center min-h-[240px]">
                {commentsModalImageUrl ? (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={commentsModalImageUrl} alt={commentsModal.file_name} className="max-h-[400px] rounded-lg" />
                    <MarkupOverlay marks={list} />
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-text-muted)] py-16">Loading image…</p>
                )}
                {commentsModalImageUrl && (
                  <button onClick={() => setFullscreenPins(true)}
                    className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/70 border border-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors">
                    <Maximize2 size={13} />
                  </button>
                )}
              </div>

              {/* Comment list */}
              {commentsLoading && !comments[commentsModal.id] ? (
                <p className="text-xs text-[var(--color-text-muted)] py-3">Loading comments…</p>
              ) : (
                <div className="space-y-2">
                  {list.length === 0 && <p className="text-xs text-[var(--color-text-muted)] py-2">No comments yet.</p>}
                  {list.map(c => (
                    <div key={c.id} className={cn('rounded-lg border p-2.5 text-xs',
                      c.comment_type === 'emboss'
                        ? 'border-[color:color-mix(in_srgb,var(--color-warning)_50%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)]'
                        : c.author_type === 'customer' ? 'border-[color:color-mix(in_srgb,var(--color-warning)_25%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_5%,transparent)]' : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)]')}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          {onImage(c) && (
                            <span className={cn('w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0',
                              c.comment_type === 'emboss' ? 'bg-[var(--color-warning)]' : c.resolved ? 'bg-[var(--color-success)]' : 'bg-[var(--color-danger)]')}>
                              {pinNumber(c.id)}
                            </span>
                          )}
                          {c.comment_type === 'emboss' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 bg-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)] text-[var(--color-warning)]">
                              <Stamp size={10} /> EMBOSS
                            </span>
                          )}
                          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
                            c.author_type === 'customer' ? 'bg-[color:color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)]' : 'bg-[color:color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]')}>
                            {c.author_type === 'customer' ? (c.author_name || 'Customer') : (c.users?.full_name || 'Staff')}
                          </span>
                          <span className="text-[var(--color-text-muted)]">{formatTimeAgo(c.created_at)}</span>
                        </div>
                        {/* Emboss marks are production instructions, not
                            complaints — nothing to "resolve". */}
                        {c.author_type === 'customer' && c.comment_type !== 'emboss' && (
                          <button onClick={() => toggleResolve(commentsModal.id, c.id, !c.resolved)}
                            className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', c.resolved
                              ? 'border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)] text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)]'
                              : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[color:color-mix(in_srgb,var(--color-success)_50%,transparent)] hover:text-[var(--color-success)]')}>
                            {c.resolved ? 'Resolved' : 'Mark Resolved'}
                          </button>
                        )}
                      </div>
                      <p className="text-[var(--color-text-primary)]">
                        {onImage(c) && <span className="font-semibold">#{pinNumber(c.id)} </span>}
                        {c.comment_text}
                      </p>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-1">
                    <input value={newComment} onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addComment(commentsModal.id)}
                      placeholder="Add an internal note…"
                      className="flex-1 min-w-0 h-11 md:h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]" />
                    <button onClick={() => addComment(commentsModal.id)} disabled={addingComment || !newComment.trim()}
                      className="h-11 md:h-9 px-3 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* Fullscreen pin view */}
      {fullscreenPins && commentsModal && commentsModalImageUrl && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-6" onClick={() => setFullscreenPins(false)}>
          <button onClick={() => setFullscreenPins(false)} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-primary)]">
            <X size={18} />
          </button>
          <div className="relative inline-block" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={commentsModalImageUrl} alt={commentsModal.file_name} className="max-w-full max-h-[90dvh] rounded-lg" />
            <MarkupOverlay marks={comments[commentsModal.id] || []} size="lg" />
          </div>
        </div>
      )}
    </div>
  )
}
