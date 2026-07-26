'use client'
import { useState } from 'react'
import { Upload, Plus, Trash2, ExternalLink, Link2, Copy, MessageCircle, X, Maximize2, Sparkles, AlertTriangle, Stamp } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { ArtworkThumb, useArtworkThumbnails } from '@/components/artwork/ArtworkThumb'
import { MarkupOverlay, markNumber } from '@/components/artwork/MarkupOverlay'
import type { MarkupShape } from '@/lib/schemas/publicToken'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatTimeAgo, formatDateTime } from '@/lib/utils/format'
import { createSupabaseClient } from '@/lib/supabase/client'
import { uploadFile, getSignedUrl } from '@/lib/utils/uploadFile'
import { ARTWORK_STATUS_CONFIG, ARTWORK_STATUS_TRANSITIONS, type ArtworkStatus } from '@/modules/artwork/types/artwork.types'

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
  file_size: number | null; file_type: string | null; designer_notes: string | null
  status: ArtworkStatus; is_production_ready: boolean; approved_at: string | null; created_at: string
  approver_name?: string | null; approver_email?: string | null; decided_at?: string | null
  ai_preflight_status?: 'pass' | 'warning' | 'fail' | null
  ai_preflight_summary?: string | null
  ai_preflight_issues?: { severity: string; title: string; detail: string }[] | null
}

const inputCls = 'w-full h-11 md:h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function JobArtworkTab({ jobId, companyId, initialArtworks }: { jobId: string; companyId: string; initialArtworks: Artwork[] }) {
  const [artworks, setArtworks] = useState(initialArtworks)
  // One batched signing request for every previewable file in this job.
  const thumbs = useArtworkThumbnails(artworks)
  const [uploadModal, setUploadModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [designerNotes, setDesignerNotes] = useState('')
  const [linkModal, setLinkModal] = useState<Artwork | null>(null)
  const [linkExpiry, setLinkExpiry] = useState('7d')
  const [generatedLink, setGeneratedLink] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const [commentsModal, setCommentsModal] = useState<Artwork | null>(null)
  const [commentsModalImageUrl, setCommentsModalImageUrl] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, ArtworkComment[]>>({})
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const [fullscreenPins, setFullscreenPins] = useState(false)
  const [preflightLoading, setPreflightLoading] = useState<string | null>(null)
  const [preflightModal, setPreflightModal] = useState<Artwork | null>(null)

  const pickFile = (file: File | null) => setSelectedFile(file)

  const viewFile = async (path: string) => {
    const supabase = createSupabaseClient()
    const url = await getSignedUrl(supabase, 'artwork', path)
    if (!url) { toast.error('Could not open file'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const upload = async () => {
    if (!selectedFile) { toast.error('Choose a file'); return }
    if (!/\.(jpe?g)$/i.test(selectedFile.name) && selectedFile.type !== 'image/jpeg') {
      toast.error('Only JPG files are accepted'); return
    }
    setLoading(true)
    try {
      const supabase = createSupabaseClient()
      const { path, error: uploadErr } = await uploadFile(
        supabase, 'artwork', companyId, `${jobId}/${Date.now()}-${selectedFile.name}`, selectedFile
      )
      if (uploadErr || !path) throw new Error(uploadErr || 'Upload failed')

      const res = await fetch('/api/v1/artwork', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId, file_name: selectedFile.name, file_url: path,
          file_size: selectedFile.size, file_type: selectedFile.name.split('.').pop()?.toUpperCase(),
          designer_notes: designerNotes,
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setArtworks(prev => [data, ...prev])
      setUploadModal(false)
      setSelectedFile(null)
      setDesignerNotes('')
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
        if (status === 'approved' && a.status === 'approved') return { ...a, status: 'archived' as ArtworkStatus, is_production_ready: false }
        return a
      }))
      toast.success(`Status changed to "${ARTWORK_STATUS_CONFIG[status].label}"`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
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

  const openLinkModal = (art: Artwork) => {
    setLinkModal(art)
    setGeneratedLink('')
    setLinkExpiry('7d')
  }

  const generateLink = async () => {
    if (!linkModal) return
    setLinkLoading(true)
    try {
      const res = await fetch(`/api/v1/artwork/${linkModal.id}/approval-link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiry: linkExpiry }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data, approval_url } = await res.json()
      setGeneratedLink(approval_url)
      setArtworks(prev => prev.map(a => a.id === linkModal.id ? { ...a, status: data.status } : a))
    } catch (e: any) { toast.error(e.message || 'Failed to generate link') }
    finally { setLinkLoading(false) }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(generatedLink)
    toast.success('Link copied')
  }

  const commentCount = (artworkId: string) => comments[artworkId]?.length || 0
  // Emboss marks are never resolved, so they must not count as an outstanding
  // customer comment — otherwise the badge stays red forever.
  const hasUnresolvedCustomerComment = (artworkId: string) =>
    comments[artworkId]?.some(c => c.author_type === 'customer' && !c.resolved && c.comment_type !== 'emboss') || false

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button onClick={() => setUploadModal(true)}
          className="w-full md:w-auto flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
          <Plus size={15} /> Add Artwork
        </button>
      </div>

      {artworks.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">No artwork yet</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Add the first version for this job</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] divide-y divide-[var(--color-border-subtle)]">
          {artworks.map(art => (
            // Same stacking as the standalone Artwork page: below md the
            // actions get their own wrapped row, at md+ the exact desktop row.
            <div key={art.id} className={cn('flex flex-col md:flex-row md:items-center gap-3 md:gap-4 px-4 md:px-5 py-3.5', art.status === 'approved' && 'bg-[color:color-mix(in_srgb,var(--color-success)_3%,transparent)]')}>
             <div className="flex items-start md:items-center gap-3 md:gap-4 flex-1 min-w-0">
              {/* 125 × 160 preview, same component as the Artwork page */}
              <ArtworkThumb
                url={thumbs[art.id]}
                fileName={art.file_name}
                fileType={art.file_type}
                version={art.version}
                approved={art.status === 'approved'}
                onClick={() => viewFile(art.file_url)}
              />

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
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
                {!['approved', 'rejected', 'archived'].includes(art.status) && (
                  <button onClick={() => openLinkModal(art)}
                    className="flex items-center gap-1 px-2.5 h-10 md:h-8 rounded-md border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors whitespace-nowrap">
                    <Link2 size={12} /> Get Approval Link
                  </button>
                )}
                <button onClick={() => openCommentsModal(art)}
                  className={cn('flex items-center gap-1 px-2.5 h-10 md:h-8 rounded-md border text-xs font-medium transition-colors whitespace-nowrap',
                    hasUnresolvedCustomerComment(art.id)
                      ? 'border-[color:color-mix(in_srgb,var(--color-danger)_50%,transparent)] text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]')}>
                  <MessageCircle size={12} />
                  {commentCount(art.id) > 0 ? commentCount(art.id) : 'Comments'}
                  {hasUnresolvedCustomerComment(art.id) && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-danger)]" />}
                </button>
                {ARTWORK_STATUS_TRANSITIONS[art.status].length > 0 && (
                  <select value="" onChange={e => e.target.value && changeStatus(art.id, e.target.value as ArtworkStatus)}
                    className="h-10 md:h-8 px-2 rounded-md border text-xs bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border-[var(--color-border)]">
                    <option value="">Move to…</option>
                    {ARTWORK_STATUS_TRANSITIONS[art.status].map(s => <option key={s} value={s}>{ARTWORK_STATUS_CONFIG[s].label}</option>)}
                  </select>
                )}
                <button onClick={() => deleteArtwork(art.id)}
                  className="w-10 h-10 md:w-8 md:h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      <Modal open={uploadModal} onClose={() => setUploadModal(false)} title="Add Artwork Version" size="md"
        footer={<>
          <button onClick={() => setUploadModal(false)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          <button onClick={upload} disabled={loading || !selectedFile}
            className="flex items-center gap-2 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            <Upload size={14} /> {loading ? 'Uploading…' : 'Add Artwork'}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="jobartworktab-1" className="text-sm font-medium text-[var(--color-text-primary)]">File <span className="text-[var(--color-danger)]">*</span></label>
            <input id="jobartworktab-1" type="file" accept=".jpg,.jpeg,image/jpeg" onChange={e => pickFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-[var(--color-text-primary)] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[var(--color-accent)] file:text-[var(--color-on-accent)] hover:file:bg-[var(--color-accent-hover)]" />
            <p className="text-xs text-[var(--color-text-muted)]">JPG only.</p>
            {selectedFile && <p className="text-xs text-[var(--color-text-muted)]">{selectedFile.name} — {formatBytes(selectedFile.size)}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="jobartworktab-2" className="text-sm font-medium text-[var(--color-text-primary)]">Designer Notes</label>
            <input id="jobartworktab-2" className={inputCls} value={designerNotes} onChange={e => setDesignerNotes(e.target.value)} placeholder="Changes made in this version…" />
          </div>
        </div>
      </Modal>

      {/* Approval Link Modal */}
      <Modal open={!!linkModal} onClose={() => setLinkModal(null)} title={`Approval Link — v${linkModal?.version}`} size="md">
        <div className="space-y-4">
          {!generatedLink ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="jobartworktab-3" className="text-sm font-medium text-[var(--color-text-primary)]">Link Expiry</label>
                <select id="jobartworktab-3" className={inputCls} value={linkExpiry} onChange={e => setLinkExpiry(e.target.value)}>
                  <option value="7d">7 Days</option>
                  <option value="14d">14 Days</option>
                  <option value="30d">30 Days</option>
                  <option value="never">Never</option>
                </select>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">The customer will be able to view this artwork and Approve, Reject, or Request Changes — no login needed. This also moves the status to &quot;Waiting Customer Approval&quot;.</p>
              <button onClick={generateLink} disabled={linkLoading}
                className="w-full flex items-center justify-center gap-2 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
                <Link2 size={14} /> {linkLoading ? 'Generating…' : 'Generate Link'}
              </button>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor="jobartworktab-4" className="text-sm font-medium text-[var(--color-text-primary)]">Share this link with the customer</label>
                <div className="flex items-center gap-2">
                  <input id="jobartworktab-4" readOnly value={generatedLink} className={inputCls} onClick={e => (e.target as HTMLInputElement).select()} />
                  <button aria-label="Copy approval link" title="Copy approval link" onClick={copyLink} className="w-11 h-11 md:w-9 md:h-9 flex-shrink-0 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors">
                    <Copy size={14} />
                  </button>
                </div>
              </div>
              <button onClick={() => setLinkModal(null)}
                className="w-full h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                Done
              </button>
            </>
          )}
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
