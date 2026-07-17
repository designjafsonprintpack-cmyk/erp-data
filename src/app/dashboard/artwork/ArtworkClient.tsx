'use client'
import { useState } from 'react'
import { Upload, CheckCircle2, Image, Plus, Trash2, ExternalLink, Filter } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatDateTime, formatTimeAgo } from '@/lib/utils/format'
import { createSupabaseClient } from '@/lib/supabase/client'
import { uploadFile, getSignedUrl } from '@/lib/utils/uploadFile'

interface Artwork {
  id: string; job_id: string; version: number; file_name: string; file_url: string
  file_size: number | null; file_type: string | null; designer_notes: string | null
  is_production_ready: boolean; approved_at: string | null; created_at: string
  jobs?: { job_number: string; job_title: string; customers?: { name: string } | null } | null
}
interface Job { id: string; job_number: string; job_title: string; customers?: { name: string } | null }

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ArtworkClient({ initialArtworks, jobs, companyId }: { initialArtworks: Artwork[]; jobs: Job[]; companyId: string }) {
  const [artworks, setArtworks] = useState(initialArtworks)
  const [filterJob, setFilterJob] = useState('')
  const [uploadModal, setUploadModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [form, setForm] = useState({
    job_id: '', file_name: '', file_url: '', file_size: '', file_type: '', designer_notes: '',
  })

  const filtered = filterJob ? artworks.filter(a => a.job_id === filterJob) : artworks

  const grouped = filtered.reduce((acc, art) => {
    const key = art.job_id
    if (!acc[key]) acc[key] = []
    acc[key].push(art)
    return acc
  }, {} as Record<string, Artwork[]>)

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

  const markReady = async (id: string, ready: boolean) => {
    try {
      const res = await fetch(`/api/v1/artwork/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_production_ready: ready }),
      })
      if (!res.ok) throw new Error()
      setArtworks(prev => prev.map(a => {
        if (a.id === id) return { ...a, is_production_ready: ready }
        // Unmark others in same job
        if (ready && a.job_id === prev.find(x => x.id === id)?.job_id) return { ...a, is_production_ready: false }
        return a
      }))
      toast.success(ready ? 'Marked as production ready' : 'Unmarked')
    } catch { toast.error('Failed') }
  }

  const deleteArtwork = async (id: string) => {
    try {
      await fetch(`/api/v1/artwork/${id}`, { method: 'DELETE' })
      setArtworks(prev => prev.filter(a => a.id !== id))
      toast.success('Artwork deleted')
    } catch { toast.error('Failed') }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <select value={filterJob} onChange={e => setFilterJob(e.target.value)}
          className="h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] transition-colors">
          <option value="">All Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
        </select>
        <button onClick={() => setUploadModal(true)}
          className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors ml-auto">
          <Plus size={15} /> Add Artwork
        </button>
      </div>

      {/* Grouped by job */}
      {Object.entries(grouped).length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-16 text-center">
          <Image size={32} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-3" />
          <p className="text-sm font-medium text-[var(--color-text-primary)]">No artwork yet</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Add artwork files for active jobs</p>
        </div>
      ) : (
        Object.entries(grouped).map(([jobId, arts]) => {
          const job = arts[0]?.jobs
          const readyVersion = arts.find(a => a.is_production_ready)
          return (
            <div key={jobId} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
              {/* Job header */}
              <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)]">
                <div>
                  <span className="text-sm font-semibold text-[var(--color-accent)] font-mono">{job?.job_number}</span>
                  <span className="text-sm text-[var(--color-text-primary)] ml-2">{job?.job_title}</span>
                  <span className="text-xs text-[var(--color-text-muted)] ml-2">{job?.customers?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {readyVersion && (
                    <span className="text-xs px-2.5 py-1 rounded-full border font-medium text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20 flex items-center gap-1.5">
                      <CheckCircle2 size={11} /> v{readyVersion.version} Production Ready
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-text-muted)]">{arts.length} version{arts.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Artwork versions */}
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {arts.map(art => (
                  <div key={art.id} className={cn('flex items-center gap-4 px-5 py-3.5',
                    art.is_production_ready && 'bg-[var(--color-success)]/3')}>
                    {/* Version badge */}
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 border',
                      art.is_production_ready
                        ? 'bg-[var(--color-success)]/10 border-[var(--color-success)]/30 text-[var(--color-success)]'
                        : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-text-muted)]')}>
                      v{art.version}
                    </div>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{art.file_name}</span>
                        {art.is_production_ready && <CheckCircle2 size={14} className="text-[var(--color-success)] flex-shrink-0" />}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {art.file_type && <span className="text-xs text-[var(--color-text-muted)] uppercase">{art.file_type}</span>}
                        <span className="text-xs text-[var(--color-text-muted)]">{formatBytes(art.file_size)}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">Uploaded {formatTimeAgo(art.created_at)}</span>
                      </div>
                      {art.designer_notes && <p className="text-xs text-[var(--color-text-secondary)] mt-1 italic">{art.designer_notes}</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => viewFile(art.file_url)}
                        className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors">
                        <ExternalLink size={13} />
                      </button>
                      <button onClick={() => markReady(art.id, !art.is_production_ready)}
                        className={cn('flex items-center gap-1 px-2.5 h-8 rounded-md border text-xs font-medium transition-colors',
                          art.is_production_ready
                            ? 'border-[var(--color-success)]/30 text-[var(--color-success)] bg-[var(--color-success)]/10 hover:bg-[var(--color-success)]/20'
                            : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-success)]/50 hover:text-[var(--color-success)]')}>
                        <CheckCircle2 size={12} />
                        {art.is_production_ready ? 'Ready ✓' : 'Mark Ready'}
                      </button>
                      <button onClick={() => deleteArtwork(art.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/30 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}

      {/* Upload Modal */}
      <Modal open={uploadModal} onClose={() => setUploadModal(false)} title="Add Artwork Version" size="md"
        footer={
          <>
            <button onClick={() => setUploadModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={upload} disabled={loading || !form.job_id || !selectedFile}
              className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              <Upload size={14} /> {loading ? 'Uploading…' : 'Add Artwork'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Job <span className="text-[var(--color-danger)]">*</span></label>
            <select className={inputCls} value={form.job_id} onChange={e => setForm(p => ({ ...p, job_id: e.target.value }))}>
              <option value="">Select job…</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">File <span className="text-[var(--color-danger)]">*</span></label>
            <input type="file" accept=".pdf,.ai,.psd,.cdr,.png,.jpg,.jpeg,.tif,.tiff,.eps"
              onChange={e => pickFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-[var(--color-text-primary)] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[var(--color-accent)] file:text-white hover:file:bg-[var(--color-accent-hover)]" />
            {selectedFile && <p className="text-xs text-[var(--color-text-muted)]">{selectedFile.name} — {formatBytes(selectedFile.size)}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Designer Notes</label>
            <input className={inputCls} value={form.designer_notes} onChange={e => setForm(p => ({ ...p, designer_notes: e.target.value }))} placeholder="Changes made in this version…" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
