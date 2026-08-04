'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Plus, Trash2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { ArtworkThumb, useArtworkThumbnails } from '@/components/artwork/ArtworkThumb'
import { toast } from '@/components/ui/Toast'
import { ARTWORK_ACCEPT, ARTWORK_ACCEPT_LABEL, ARTWORK_REJECT_MESSAGE, isAcceptedArtworkFile } from '@/lib/utils/artworkFileTypes'
import { Modal } from '@/components/ui/Modal'
import { formatTimeAgo, formatDateTime } from '@/lib/utils/format'
import { createSupabaseClient } from '@/lib/supabase/client'
import { getSignedUrl } from '@/lib/utils/uploadFile'
import { uploadArtworkWithThumb } from '@/lib/utils/uploadArtwork'
import { ARTWORK_STATUS_CONFIG, ARTWORK_STATUS_TRANSITIONS, type ArtworkStatus } from '@/modules/artwork/types/artwork.types'

// Comments, on-image markup and the AI pre-flight check are gone from this tab.
// The customer approves on WhatsApp and staff upload the file that was already
// signed off, so an upload IS the approval — there is nothing left to mark up
// and no decision for a machine to advise on.
interface Artwork {
  id: string; job_id: string; version: number; file_name: string; file_url: string
  /** Small preview beside the original (migration 130); NULL on older rows. */
  thumb_url?: string | null
  /** Which DESIGN this belongs to (migration 124). Legacy rows are 1. */
  design_no?: number | null
  design_label?: string | null
  file_size: number | null; file_type: string | null; designer_notes: string | null
  status: ArtworkStatus; is_production_ready: boolean; approved_at: string | null; created_at: string
  approver_name?: string | null; approver_email?: string | null; decided_at?: string | null
}

const inputCls = 'w-full h-11 md:h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function JobArtworkTab({ jobId, companyId, initialArtworks }: { jobId: string; companyId: string; initialArtworks: Artwork[] }) {
  const router = useRouter()
  const [artworks, setArtworks] = useState(initialArtworks)

  /**
   * Keep local state in step with the server's.
   *
   * WHY THIS IS NEEDED
   *   Job Detail renders its tabs as `{activeTab === 'artwork' && <JobArtworkTab …/>}`,
   *   so leaving the tab UNMOUNTS this component and coming back MOUNTS a fresh
   *   one — whose `useState(initialArtworks)` re-reads the props the server
   *   rendered when the PAGE loaded. Anything uploaded since was only ever in
   *   local state, so it vanished. On a job whose artwork was all uploaded in
   *   this visit, the tab came back completely empty and only a hard refresh
   *   brought it back. Mehboob hit exactly that.
   *
   *   Every mutation below now calls router.refresh(), which re-runs the server
   *   component so `initialArtworks` is current — and this effect copies that
   *   into state, so it also lands while the tab is still open.
   *
   * KEYED ON CONTENT, NOT ARRAY IDENTITY
   *   The parent hands down a brand-new array on every one of its own renders
   *   (opening a modal, switching a tab). Depending on `initialArtworks`
   *   directly would reset state on all of those and could wipe an optimistic
   *   update before router.refresh() had returned. The signature only changes
   *   when the server data genuinely does.
   */
  const serverSignature = initialArtworks
    .map(a => `${a.id}:${a.status}:${a.version}:${a.design_no ?? 1}`)
    .join('|')
  useEffect(() => {
    setArtworks(initialArtworks)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content signature, not identity; see above
  }, [serverSignature])
  // One batched signing request for every previewable file in this job.
  const thumbs = useArtworkThumbnails(artworks)
  const [uploadModal, setUploadModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [designerNotes, setDesignerNotes] = useState('')

  // ─── Which design is being uploaded (migration 124) ───────────────────────
  // '' = a NEW design; a number = another version of that design. Set when the
  // modal OPENS (openUpload below) rather than here, because `designs` is
  // derived further down and isn't available at useState time. Opening
  // pre-selects design 1 when the job already has artwork: adding a revision is
  // much the commoner act, and defaulting to "new design" would quietly
  // fragment a job's version history.
  const [targetDesign, setTargetDesign] = useState<string>('')
  const [designLabel, setDesignLabel] = useState('')

  /** Every design on this job, in order, each with its versions newest-first. */
  const designs = (() => {
    const byDesign = new Map<number, Artwork[]>()
    for (const a of artworks) {
      const d = a.design_no ?? 1
      if (!byDesign.has(d)) byDesign.set(d, [])
      byDesign.get(d)!.push(a)
    }
    return Array.from(byDesign.entries())
      .sort((x, y) => x[0] - y[0])
      .map(([designNo, versions]) => ({
        designNo,
        // The label lives on whichever version carried it; the newest wins.
        label: versions.map(v => v.design_label).find(Boolean) ?? null,
        versions: [...versions].sort((a, b) => b.version - a.version),
      }))
  })()
  const pickFile = (file: File | null) => setSelectedFile(file)

  const openUpload = () => {
    setTargetDesign(designs.length ? String(designs[0].designNo) : '')
    setDesignLabel('')
    setUploadModal(true)
  }

  const viewFile = async (path: string) => {
    const supabase = createSupabaseClient()
    const url = await getSignedUrl(supabase, 'artwork', path)
    if (!url) { toast.error('Could not open file'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const upload = async () => {
    if (!selectedFile) { toast.error('Choose a file'); return }
    if (!isAcceptedArtworkFile(selectedFile.name, selectedFile.type)) {
      toast.error(ARTWORK_REJECT_MESSAGE); return
    }
    setLoading(true)
    try {
      const supabase = createSupabaseClient()
      const { path, thumbPath, error: uploadErr } = await uploadArtworkWithThumb(
        supabase, companyId, jobId, selectedFile
      )
      if (uploadErr || !path) throw new Error(uploadErr || 'Upload failed')

      const res = await fetch('/api/v1/artwork', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId, file_name: selectedFile.name, file_url: path,
          ...(thumbPath ? { thumb_url: thumbPath } : {}),
          file_size: selectedFile.size, file_type: selectedFile.name.split('.').pop()?.toUpperCase(),
          designer_notes: designerNotes,
          // '' means NEW DESIGN — the route reads a missing design_no as
          // "another design" and numbers it max+1. Sending 0 or null would be
          // a different thing entirely, so the key is omitted, not blanked.
          ...(targetDesign ? { design_no: Number(targetDesign) } : {}),
          ...(designLabel.trim() ? { design_label: designLabel.trim() } : {}),
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setArtworks(prev => [data, ...prev])
      // Makes initialArtworks current, so leaving and re-entering the tab keeps it.
      router.refresh()
      setUploadModal(false)
      setSelectedFile(null)
      setDesignerNotes('')
      setTargetDesign('')
      setDesignLabel('')
      // Uploading IS the approval now — say so, so nobody goes looking for a
      // status to change afterwards.
      toast.success(
        data.design_no > 1 || designs.length > 1
          ? `Design ${data.design_no} v${data.version} added and marked approved`
          : `Artwork v${data.version} added and marked approved`
      )
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
      setArtworks(prev => {
        const target = prev.find(x => x.id === id)
        return prev.map(a => {
          if (a.id === id) return { ...a, status, is_production_ready: status === 'approved' }
          // Only the SAME DESIGN's previously-approved version is superseded.
          // Job-wide (what this used to do) it archived the lid's approval when
          // the base was approved — and the workflow gate wants EVERY design
          // approved, so the job could never clear it.
          if (status === 'approved' && target
              && (a.design_no ?? 1) === (target.design_no ?? 1) && a.status === 'approved') {
            return { ...a, status: 'archived' as ArtworkStatus, is_production_ready: false }
          }
          return a
        })
      })
      // The most important of the five: approving an artwork is what opens the
      // workflow's artwork gate, and the Workflow tab reads the SERVER's copy.
      // Without this the gate could still be reading "draft" after an approval.
      router.refresh()
      toast.success(`Status changed to "${ARTWORK_STATUS_CONFIG[status].label}"`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
  }

  const deleteArtwork = async (id: string) => {
    try {
      await fetch(`/api/v1/artwork/${id}`, { method: 'DELETE' })
      setArtworks(prev => prev.filter(a => a.id !== id))
      router.refresh()
      toast.success('Artwork deleted')
    } catch { toast.error('Failed') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button onClick={openUpload}
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
                  {/* Only shown once a job actually HAS more than one design —
                      on the overwhelming majority of jobs this chip would be
                      noise saying "Design 1" on every single row. */}
                  {designs.length > 1 && (
                    <span className="text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0
                                     bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)]
                                     border-[color:color-mix(in_srgb,var(--color-accent)_25%,transparent)]
                                     text-[var(--color-accent)]">
                      {art.design_label || `Design ${art.design_no ?? 1}`}
                    </span>
                  )}
                  <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{art.file_name}</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 flex-shrink-0', ARTWORK_STATUS_CONFIG[art.status].color)}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', ARTWORK_STATUS_CONFIG[art.status].dot)} />
                    {ARTWORK_STATUS_CONFIG[art.status].label}
                  </span>
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
      <Modal open={uploadModal} onClose={() => setUploadModal(false)} title={designs.length === 0 ? 'Add Artwork' : targetDesign ? 'Add a New Version' : 'Add a Different Design'} size="md"
        footer={<>
          <button onClick={() => setUploadModal(false)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          <button onClick={upload} disabled={loading || !selectedFile}
            className="flex items-center gap-2 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            <Upload size={14} /> {loading ? 'Uploading…' : 'Add Artwork'}
          </button>
        </>}>
        <div className="space-y-4">
          {/*
            The choice is only shown when there IS one.
            The first upload on a job used to render a dropdown whose only entry
            was "A separate new design" — a question with a single answer, asked
            before the user had done anything. Now the first upload just asks for
            a file and, optionally, a name.
          */}
          {designs.length > 0 && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">What are you adding?</span>
              {/* Two buttons, not a <select>: the choice changes what the rest of
                  the form means, and a dropdown hides that behind a tap. Same
                  chip pattern as "What changed?" on New Job. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetDesign(String(designs[0].designNo))}
                  aria-pressed={!!targetDesign}
                  className={cn(
                    'text-left px-3 py-2.5 rounded-lg border transition-colors',
                    targetDesign
                      ? 'border-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
                  )}>
                  <span className="block text-sm font-medium text-[var(--color-text-primary)]">A newer version</span>
                  <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">Same design, corrected file</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTargetDesign('')}
                  aria-pressed={!targetDesign}
                  className={cn(
                    'text-left px-3 py-2.5 rounded-lg border transition-colors',
                    !targetDesign
                      ? 'border-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
                  )}>
                  <span className="block text-sm font-medium text-[var(--color-text-primary)]">A different design</span>
                  <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">Like Inner and Outer</span>
                </button>
              </div>
            </div>
          )}

          {/* Which existing design — only when there is more than one to choose
              between. With a single design the button above already said it. */}
          {targetDesign && designs.length > 1 && (
            <div className="space-y-1.5">
              <label htmlFor="jobartworktab-design" className="text-sm font-medium text-[var(--color-text-primary)]">A newer version of</label>
              <select id="jobartworktab-design" className={inputCls} value={targetDesign}
                onChange={e => setTargetDesign(e.target.value)}>
                {designs.map(d => (
                  <option key={d.designNo} value={String(d.designNo)}>
                    {d.label || `Design ${d.designNo}`} — currently v{d.versions[0]?.version ?? 1}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!targetDesign && (
            <div className="space-y-1.5">
              <label htmlFor="jobartworktab-designlabel" className="text-sm font-medium text-[var(--color-text-primary)]">
                Name this design <span className="text-[var(--color-text-muted)] font-normal">(optional)</span>
              </label>
              <input id="jobartworktab-designlabel" className={inputCls} value={designLabel}
                onChange={e => setDesignLabel(e.target.value)} maxLength={60}
                placeholder="Inner, Outer, Lid, Base…" />
              {designs.length > 0 && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  Both designs stay on the job. Artwork can&apos;t be completed until every design is approved.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="jobartworktab-1" className="text-sm font-medium text-[var(--color-text-primary)]">File <span className="text-[var(--color-danger)]">*</span></label>
            <input id="jobartworktab-1" type="file" accept={ARTWORK_ACCEPT} onChange={e => pickFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-[var(--color-text-primary)] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[var(--color-accent)] file:text-[var(--color-on-accent)] hover:file:bg-[var(--color-accent-hover)]" />
            <p className="text-xs text-[var(--color-text-muted)]">{ARTWORK_ACCEPT_LABEL}</p>
            {selectedFile && <p className="text-xs text-[var(--color-text-muted)]">{selectedFile.name} — {formatBytes(selectedFile.size)}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="jobartworktab-2" className="text-sm font-medium text-[var(--color-text-primary)]">Designer Notes</label>
            <input id="jobartworktab-2" className={inputCls} value={designerNotes} onChange={e => setDesignerNotes(e.target.value)} placeholder={targetDesign ? 'What changed in this version…' : 'Anything the floor should know…'} />
          </div>
        </div>
      </Modal>

    </div>
  )
}
