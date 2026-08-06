'use client'
import { useState } from 'react'
import { Plus, Search, ExternalLink, Scissors, Trash2, RotateCcw, History, Lock, AlertTriangle, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { Toolbar } from '@/components/ui/Toolbar'
import { toast } from '@/components/ui/Toast'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatTimeAgo, formatDateTime, planLabel } from '@/lib/utils/format'
import { JOB_PRIORITY_CONFIG } from '@/modules/jobs/types/job.types'
import type { JobNeedingPlates } from '@/lib/utils/jobsNeedingPlates'
import { Pagination } from '@/components/ui/Pagination'
import { useServerPagedList } from '@/lib/hooks/useServerPagedList'

interface Plate {
  id: string; color: string; plate_size: string | null; status: string
  origin_job_id: string | null; remarks: string | null; created_at: string; made_date: string | null
  origin_job?: { job_number: string; job_title: string } | null
  current_job?: { assignment_id: string; job_number: string; job_title: string } | null
}
interface JobPlateHistoryRow {
  id: string; assigned_at: string; returned_at: string | null
  is_reused: boolean; condition_on_assign: string | null; condition_on_return: string | null
  jobs?: { job_number: string; job_title: string } | null
  machines?: { name: string; code: string } | null
}
interface Job { id: string; job_number: string; job_title: string; customers?: { name: string } | null }
interface ColorSpecOption { id: string; name: string }

const SIZES = ['1030 x 790', '1030 x 770']
// Largest to smallest — mirrors the server-side rule in
// /api/v1/plates/[id]: a plate can only move DOWN this list.
const SIZE_ORDER = SIZES

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'info' | 'danger' }> = {
  in_storage: { label: 'In Storage', variant: 'success' },
  in_use:     { label: 'In Use',     variant: 'info' },
  damaged:    { label: 'Damaged',    variant: 'danger' },
}

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

type ColorRow = { color: string; mode: 'new' | 'old'; existing_plate_id: string }

export default function PlatesClient({ initialPlates, initialTotal, jobs, jobsNeedingPlates, colorSpecs = [], reusablePlates = [], platedJobNumbers = [] }: { initialPlates: Plate[]; initialTotal: number; jobs: Job[]; jobsNeedingPlates: JobNeedingPlates[]; colorSpecs?: ColorSpecOption[]; reusablePlates?: Plate[]; platedJobNumbers?: string[] }) {
  // Local copy so a job disappears from "Plates Needed" the moment its plates
  // are added, without waiting for a server render.
  const [needPlates, setNeedPlates] = useState(jobsNeedingPlates)
  const [reusingJob, setReusingJob] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [addModal, setAddModal] = useState(false)
  const [addJobId, setAddJobId] = useState('')
  const [addSize, setAddSize] = useState(SIZES[0])
  const [addMadeDate, setAddMadeDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [colorRows, setColorRows] = useState<ColorRow[]>([{ color: '', mode: 'new', existing_plate_id: '' }])
  const [adding, setAdding] = useState(false)

  const [sizeEdit, setSizeEdit] = useState<string | null>(null) // plate id currently being size-edited

  const [historyModal, setHistoryModal] = useState<Plate | null>(null)
  const [historyRows, setHistoryRows] = useState<JobPlateHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [jobFilter, setJobFilter] = useState('') // '', '__unassigned__', or a job_number

  // Search, status and job all filter in the query now, so the registry can be
  // read past the old 200-row cap.
  const list = useServerPagedList<Plate>({
    endpoint: '/api/v1/plates',
    initialRows: initialPlates,
    initialTotal,
    errorMessage: 'Failed to load plates',
  })
  const plates = list.rows
  const setPlates = list.setRows

  const queryFor = (q: string, st: string, jf: string) => ({
    search: q, status: st,
    ...(jf === '__unassigned__' ? { assigned: 'none' } : jf ? { job_number: jf } : {}),
  })
  const changeSearch = (v: string) => {
    setSearch(v)
    clearTimeout((window as any)._plTimer)
    ;(window as any)._plTimer = setTimeout(() => list.applyFilter(queryFor(v, statusFilter, jobFilter)), 350)
  }
  const changeStatusFilter = (v: string) => { setStatusFilter(v); list.applyFilter(queryFor(search, v, jobFilter)) }
  const changeJob    = (v: string) => { setJobFilter(v);    list.applyFilter(queryFor(search, statusFilter, v)) }

  const [returnModal, setReturnModal] = useState<Plate | null>(null)
  const [returnCondition, setReturnCondition] = useState<'good' | 'worn' | 'damaged'>('good')
  const [returning, setReturning] = useState(false)

  // Every in-storage plate, fetched separately — this feeds the "reuse an
  // existing plate" dropdown, which must not shrink to whatever is on the
  // current page.
  const availableForReuse = reusablePlates.filter(p => !addSize || p.plate_size === addSize)

  // No browser-side filtering left — the rows in hand already match the
  // search, the status and the job filter.
  const filtered = plates

  // Job-wise grouping — plates for the same job sit together under one
  // header instead of one flat list where the job is just another column,
  // easy to lose track of when scanning. Plates not currently with any job
  // (in storage, or a stale origin_job that's no longer active) fall into
  // one "In Storage / Not Currently Assigned" group at the end.
  const UNASSIGNED = '__unassigned__'
  const groupOrder: string[] = []
  const groupsMap = new Map<string, { job_number: string; job_title: string } | null>()
  const groupedPlates = new Map<string, Plate[]>()
  for (const p of filtered) {
    const key = p.current_job ? p.current_job.job_number : UNASSIGNED
    if (!groupedPlates.has(key)) {
      groupOrder.push(key)
      groupsMap.set(key, p.current_job ? { job_number: p.current_job.job_number, job_title: p.current_job.job_title } : null)
      groupedPlates.set(key, [])
    }
    groupedPlates.get(key)!.push(p)
  }
  // Active-job groups first (most recently touched job first, since
  // `plates` already comes newest-first), unassigned/storage group last.
  groupOrder.sort((a, b) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : 0))

  // Every job that currently holds a plate, computed server-side. Deriving it
  // from the loaded rows would have offered only the jobs on this page.
  const jobNumbersForFilter = platedJobNumbers

  const addColorRow = () => setColorRows(prev => [...prev, { color: '', mode: 'new', existing_plate_id: '' }])
  const removeColorRow = (i: number) => setColorRows(prev => prev.filter((_, idx) => idx !== i))
  const updateColorRow = (i: number, patch: Partial<ColorRow>) =>
    setColorRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))

  const resetAddForm = () => {
    setAddJobId(''); setAddSize(SIZES[0])
    setColorRows([{ color: '', mode: 'new', existing_plate_id: '' }])
  }

  // "Add Plates" straight off a job card — the job is already the answer, so
  // the form opens with it selected and one colour row per colour the job
  // actually prints.
  /**
   * Is carton ke pichle run ki saari plates aik saath is run par.
   * Ginti ke saath jawab dikhaya jata hai — "ho gaya" se ye pata nahi chalta
   * ke chaar mein se chaar lagin ya do, aur baqi do kyun reh gayin.
   */
  const reuseFamilyPlates = async (job: JobNeedingPlates) => {
    setReusingJob(job.job_id)
    try {
      const res = await fetch(`/api/v1/jobs/${job.job_id}/plates/reuse-family`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      const { assigned, skipped, from } = json.data
      if (assigned.length) {
        toast.success(`${assigned.length} plate ${from} se lag gayi${skipped.length ? ` · ${skipped.length} reh gayi` : ''}`)
        // Plates lag gayin to ye job ab intezar mein nahi — list se khud hat
        // jati hai, bilkul waise jaise plate haath se lagane par hoti hai.
        setNeedPlates(prev => prev.filter(j => j.job_id !== job.job_id))
      } else {
        toast.error(skipped.map((s: any) => `${s.plate}: ${s.reason}`).join(' · ') || 'Koi plate nahi lagi')
      }
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setReusingJob(null) }
  }

  const openAddForJob = (job: JobNeedingPlates) => {
    setAddJobId(job.job_id)
    setAddSize(SIZES[0])
    const colors = Math.min(Math.max(job.no_of_colors ?? 1, 1), 8)
    setColorRows(Array.from({ length: colors }, () => ({ color: '', mode: 'new' as const, existing_plate_id: '' })))
    setAddModal(true)
  }

  const submitAdd = async () => {
    const rows = colorRows.filter(r => r.color.trim() || r.mode === 'old')
    if (rows.length === 0) { toast.error('Add at least one color'); return }
    for (const r of rows) {
      if (r.mode === 'new' && !r.color.trim()) { toast.error('Enter a color name'); return }
      if (r.mode === 'old' && !r.existing_plate_id) { toast.error('Select an existing plate for each "Old" row'); return }
    }
    setAdding(true)
    try {
      const res = await fetch('/api/v1/plates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: addJobId || null, plate_size: addSize, made_date: addMadeDate,
          colors: rows.map(r => ({ color: r.color.trim(), mode: r.mode, existing_plate_id: r.existing_plate_id || undefined })),
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      // Refresh list simply: merge new/updated plates in
      setPlates(prev => {
        const ids = new Set(data.map((p: any) => p.id))
        return [...data, ...prev.filter(p => !ids.has(p.id))]
      })
      // Plates are now issued to this job, so it's off the needed list.
      if (addJobId) setNeedPlates(prev => prev.filter(j => j.job_id !== addJobId))
      setAddModal(false)
      resetAddForm()
      toast.success(`${data.length} plate${data.length > 1 ? 's' : ''} added`)
    } catch (e: any) { toast.error(e.message || 'Failed to add plates') }
    finally { setAdding(false) }
  }

  const changeStatus = async (plate: Plate, status: string) => {
    try {
      const res = await fetch(`/api/v1/plates/${plate.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      setPlates(prev => prev.map(p => p.id === plate.id ? { ...p, status } : p))
    } catch { toast.error('Failed to update status') }
  }

  const changeSize = async (plate: Plate, newSize: string) => {
    if (newSize === plate.plate_size) { setSizeEdit(null); return }
    try {
      const res = await fetch(`/api/v1/plates/${plate.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate_size: newSize }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to change size') }
      const { data } = await res.json()
      setPlates(prev => prev.map(p => p.id === plate.id ? { ...p, plate_size: data.plate_size, remarks: data.remarks } : p))
      toast.success(`Resized to ${newSize}`)
    } catch (e: any) { toast.error(e.message || 'Failed to change size') }
    finally { setSizeEdit(null) }
  }

  // Sizes this plate is still allowed to become — itself, plus anything
  // smaller (never back up to a larger size once cut down). If the plate
  // has no size yet, or an old free-text value from before the two-size
  // model, every size is offered.
  const allowedSizesFor = (plate: Plate): string[] => {
    const idx = plate.plate_size ? SIZE_ORDER.indexOf(plate.plate_size) : -1
    return idx === -1 ? SIZE_ORDER : SIZE_ORDER.slice(idx)
  }

  const openHistory = async (plate: Plate) => {
    setHistoryModal(plate)
    setHistoryLoading(true)
    setHistoryRows([])
    try {
      const res = await fetch(`/api/v1/plates/${plate.id}`)
      if (!res.ok) throw new Error('Failed to load history')
      const { data } = await res.json()
      setHistoryRows(data.history ?? [])
    } catch {
      toast.error('Failed to load plate history')
    } finally {
      setHistoryLoading(false)
    }
  }

  const openReturn = (plate: Plate) => {
    setReturnCondition('good')
    setReturnModal(plate)
  }

  const submitReturn = async () => {
    if (!returnModal?.current_job) return
    setReturning(true)
    try {
      const res = await fetch(`/api/v1/job-plates/${returnModal.current_job.assignment_id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition_on_return: returnCondition }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to return plate') }
      // Mirror the server's own status mapping (job-plates/[id] PATCH):
      // good/worn -> in_storage, damaged -> damaged. And it's no longer
      // "with" any job.
      const newStatus = returnCondition === 'damaged' ? 'damaged' : 'in_storage'
      setPlates(prev => prev.map(p => p.id === returnModal.id ? { ...p, status: newStatus, current_job: null } : p))
      toast.success('Plate returned')
      setReturnModal(null)
    } catch (e: any) {
      toast.error(e.message || 'Failed to return plate')
    } finally {
      setReturning(false)
    }
  }

  // Native confirm() can't be themed, ignores the app's dark palette and on a
  // phone reads as a browser warning rather than part of the app — the rest of
  // the codebase uses ConfirmDialog for exactly this.
  const [deleteTarget, setDeleteTarget] = useState<Plate | null>(null)
  const [deletingPlate, setDeletingPlate] = useState(false)

  const deletePlate = async () => {
    if (!deleteTarget) return
    setDeletingPlate(true)
    try {
      await fetch(`/api/v1/plates/${deleteTarget.id}`, { method: 'DELETE' })
      setPlates(prev => prev.filter(p => p.id !== deleteTarget.id))
      toast.success('Plate deleted')
      setDeleteTarget(null)
    } catch { toast.error('Failed') }
    finally { setDeletingPlate(false) }
  }

  return (
    <div className="space-y-4">
      {/* Plates Needed — the plate room's work list. Printing is hard-blocked
          without an active job_plates row, so these are the jobs about to hit
          that wall. A job leaves this list on its own once plates are issued. */}
      {needPlates.length > 0 && (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_6%,transparent)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)] flex items-center gap-2">
            <AlertTriangle size={14} className="text-[var(--color-warning)] flex-shrink-0" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Plates Needed</h2>
            <span className="text-xs text-[var(--color-text-muted)]">
              {needPlates.length} job{needPlates.length > 1 ? 's' : ''} waiting — printing can&apos;t start without plates
            </span>
          </div>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {needPlates.map(job => {
              const pcfg = JOB_PRIORITY_CONFIG[job.priority as keyof typeof JOB_PRIORITY_CONFIG]
              return (
                <div key={job.job_id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/dashboard/jobs/${job.job_id}`}
                        className="text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)] truncate">
                        {job.job_number} — {job.job_title}
                      </Link>
                      {pcfg && <span className={cn('text-[10px] font-medium flex-shrink-0', pcfg.color)}>{pcfg.label}</span>}
                      {job.printing_status === 'in_progress' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[color:color-mix(in_srgb,var(--color-danger)_15%,transparent)] text-[var(--color-danger)] flex-shrink-0">
                          PRESS WAITING
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[var(--color-text-muted)] flex-wrap">
                      {job.customer_name && <span>{job.customer_name}</span>}
                      {job.no_of_colors != null && <span>· {job.no_of_colors} color</span>}
                      {job.planned_date && <span className="text-[var(--color-accent)]">· {planLabel(job.planned_date)}</span>}
                    </div>
                  </div>
                  {/* Repeat par is carton ki purani plates pehle se maujood
                      hain — wohi die, wohi plates. Poora set aik click mein
                      chaRh jata hai; pehle CMYK ke liye chaar dafa alag alag
                      dhoondna aur chunna parta tha. Naye carton par ye button
                      hota hi nahi: uski koi purani plate ho hi nahi sakti. */}
                  {(job.reusable_plates?.length ?? 0) > 0 && (
                    <button onClick={() => reuseFamilyPlates(job)} disabled={reusingJob === job.job_id}
                      title={`${job.reusable_plates!.map(p => p.color || p.plate_code).filter(Boolean).join(', ')} — ${job.reusable_plates![0].origin_job_number} se`}
                      className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-8 rounded-md border text-sm md:text-xs font-medium flex-shrink-0 transition-colors disabled:opacity-60
                        border-[color:color-mix(in_srgb,var(--color-success)_40%,transparent)]
                        text-[var(--color-success)]
                        bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)]
                        hover:bg-[color:color-mix(in_srgb,var(--color-success)_18%,transparent)]">
                      <RefreshCw size={14} />
                      {reusingJob === job.job_id
                        ? 'Lag rahi hain…'
                        : `${job.reusable_plates!.length} purani plates lagao`}
                    </button>
                  )}
                  <button onClick={() => openAddForJob(job)}
                    className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-8 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm md:text-xs font-medium hover:bg-[var(--color-accent-hover)] transition-colors flex-shrink-0">
                    <Plus size={14} /> Add Plates
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <Toolbar
        search={{ value: search, onChange: changeSearch, placeholder: 'Search color…' }}
        filters={
          <>
            <select value={statusFilter} onChange={e => changeStatusFilter(e.target.value)}
              className="h-11 md:h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]">
              <option value="">All Statuses</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={jobFilter} onChange={e => changeJob(e.target.value)}
              className="h-11 md:h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]">
              <option value="">All Jobs</option>
              <option value="__unassigned__">In Storage / Not Assigned</option>
              {jobNumbersForFilter.map(jn => <option key={jn} value={jn}>{jn}</option>)}
            </select>
          </>
        }
        activeFilterCount={(statusFilter ? 1 : 0) + (jobFilter ? 1 : 0)}
        onClearFilters={() => { setStatusFilter(''); setJobFilter(''); list.applyFilter(queryFor(search, '', '')) }}
        actions={
          <button onClick={() => setAddModal(true)}
            className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
            <Plus size={15} /> Add Plates
          </button>
        }
      />

      {/* Job-wise groups */}
      {filtered.length === 0 ? (
        <EmptyState title="No plates found" description="Add your first plate to get started" />
      ) : (
        <div className="space-y-4">
          {groupOrder.map(key => {
            const group = groupsMap.get(key)
            const groupPlates = groupedPlates.get(key)!
            return (
              <div key={key} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-x-auto">
                <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_60%,transparent)] flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-[760px]">
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {group ? `${group.job_number} — ${group.job_title}` : 'In Storage / Not Currently Assigned'}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">({groupPlates.length} plate{groupPlates.length > 1 ? 's' : ''})</span>
                </div>
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                      <th className="px-4 py-2 font-medium">Color</th>
                      <th className="px-4 py-2 font-medium">Size</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Made Date</th>
                      <th className="px-4 py-2 font-medium">Added</th>
                      <th className="px-4 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {groupPlates.map(plate => (
                      <tr key={plate.id} className="hover:bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_50%,transparent)] transition-colors">
                        <td className="px-4 py-2.5 font-medium text-[var(--color-text-primary)]">
                          {plate.color}
                          {!plate.current_job && plate.origin_job && (
                            <p className="text-[11px] font-normal text-[var(--color-text-muted)] mt-0.5" title="Originally made for this job — not currently assigned to it">
                              Originally: {plate.origin_job.job_number}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {sizeEdit === plate.id ? (
                            <select autoFocus defaultValue={plate.plate_size || SIZES[0]} onBlur={e => changeSize(plate, e.target.value)}
                              onChange={e => changeSize(plate, e.target.value)}
                              className="h-9 md:h-7 px-2 rounded-md border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-accent)]">
                              {allowedSizesFor(plate).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : allowedSizesFor(plate).length > 1 ? (
                            <button onClick={() => setSizeEdit(plate.id)} className="flex items-center gap-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors" title="Click to cut down to a smaller size">
                              {plate.plate_size || '—'}
                              <Scissors size={11} className="text-[var(--color-text-muted)]" />
                            </button>
                          ) : (
                            <span className="flex items-center gap-1.5 text-[var(--color-text-secondary)]" title="Already at the smallest size — can't be resized further">
                              {plate.plate_size || '—'}
                              <Lock size={10} className="text-[var(--color-text-muted)]" />
                            </span>
                          )}
                          {plate.remarks && (
                            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{plate.remarks.split('\n').pop()}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <select value={plate.status} onChange={e => changeStatus(plate, e.target.value)}
                            className="h-9 md:h-7 px-2 rounded-md border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]">
                            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-[var(--color-text-muted)] text-xs">{plate.made_date || '—'}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-muted)] text-xs">{formatTimeAgo(plate.created_at)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {plate.current_job && (
                              <button onClick={() => openReturn(plate)} title="Return this plate (job is done with it)"
                                className="w-9 h-9 md:w-8 md:h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-success)] hover:border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)] transition-colors">
                                <RotateCcw size={13} />
                              </button>
                            )}
                            <button onClick={() => openHistory(plate)} title="Assignment history"
                              className="w-9 h-9 md:w-8 md:h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[color:color-mix(in_srgb,var(--color-accent)_30%,transparent)] transition-colors">
                              <History size={13} />
                            </button>
                            <button onClick={() => setDeleteTarget(plate)} title="Delete"
                              className="w-9 h-9 md:w-8 md:h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      <Pagination page={list.page} total={list.total} pageSize={list.pageSize}
        loading={list.loading}
        onPageChange={p => list.goToPage(p, queryFor(search, statusFilter, jobFilter))}
        noun="plates" />

      {/* Add Plates Modal */}
      <Modal open={addModal} onClose={() => { setAddModal(false); resetAddForm() }} title="Add Plates" size="md"
        footer={<>
          <button onClick={() => { setAddModal(false); resetAddForm() }} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          <button onClick={submitAdd} disabled={adding}
            className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            {adding ? 'Adding…' : 'Add Plates'}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="platesclient-1" className="text-sm font-medium text-[var(--color-text-primary)]">Job</label>
            <select id="platesclient-1" className={inputCls} value={addJobId} onChange={e => setAddJobId(e.target.value)}>
              <option value="">— Keep in storage (no job yet) —</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="platesclient-2" className="text-sm font-medium text-[var(--color-text-primary)]">Size</label>
            <select id="platesclient-2" className={inputCls} value={addSize} onChange={e => setAddSize(e.target.value)}>
              {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="platesclient-3" className="text-sm font-medium text-[var(--color-text-primary)]">Made Date</label>
            <input id="platesclient-3" type="date" className={inputCls} value={addMadeDate} onChange={e => setAddMadeDate(e.target.value)} />
          </div>

          <div className="pt-2 border-t border-[var(--color-border-subtle)] space-y-2">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Colors</label>
            {colorRows.map((row, i) => {
              const reuseOptions = plates.filter(p => p.status === 'in_storage' && p.plate_size === addSize)
              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <input value={row.color} onChange={e => updateColorRow(i, { color: e.target.value })}
                      list="color-specs-datalist" placeholder="e.g. Cyan" className="flex-1 min-w-0 h-11 md:h-8 px-2.5 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]" />
                    <button onClick={() => updateColorRow(i, { mode: 'new' })}
                      className={cn('h-11 md:h-8 px-2.5 rounded-md border text-xs font-medium transition-colors flex-shrink-0',
                        row.mode === 'new' ? 'border-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]')}>
                      New
                    </button>
                    <button onClick={() => updateColorRow(i, { mode: 'old' })}
                      className={cn('h-11 md:h-8 px-2.5 rounded-md border text-xs font-medium transition-colors flex-shrink-0',
                        row.mode === 'old' ? 'border-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]')}>
                      Old
                    </button>
                    {colorRows.length > 1 && (
                      <button onClick={() => removeColorRow(i)} aria-label="Remove color" className="w-11 h-11 md:w-8 md:h-8 flex items-center justify-center flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  {row.mode === 'old' && (
                    <select value={row.existing_plate_id} onChange={e => updateColorRow(i, { existing_plate_id: e.target.value })}
                      className="w-full h-11 md:h-8 px-2.5 rounded-md border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]">
                      <option value="">Select existing {addSize} plate…</option>
                      {reuseOptions.map(p => <option key={p.id} value={p.id}>{p.color}</option>)}
                    </select>
                  )}
                </div>
              )
            })}
            <button onClick={addColorRow}
              className="w-full h-11 md:h-8 rounded-md border border-dashed border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors flex items-center justify-center gap-1.5">
              <Plus size={12} /> Add another color
            </button>
            {colorSpecs.length > 0 && (
              <datalist id="color-specs-datalist">
                {colorSpecs.map(c => <option key={c.id} value={c.name} />)}
              </datalist>
            )}
          </div>
        </div>
      </Modal>

      {/* Plate History Modal */}
      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} title={historyModal ? `${historyModal.color} — Assignment History` : ''} size="md">
        {historyLoading ? (
          <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">Loading…</p>
        ) : historyRows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">This plate has never been assigned to a job yet.</p>
        ) : (
          <div className="space-y-2">
            {historyRows.map(row => (
              <div key={row.id} className="rounded-lg border border-[var(--color-border)] px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {row.jobs ? `${row.jobs.job_number} — ${row.jobs.job_title}` : 'Unknown job'}
                  </span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium',
                    row.returned_at ? 'border-[var(--color-border)] text-[var(--color-text-muted)]' : 'border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)]')}>
                    {row.returned_at ? 'Returned' : 'Currently With This Job'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-[var(--color-text-muted)]">
                  <span>{row.is_reused ? 'Reused plate' : 'New plate'}</span>
                  {row.machines && <span>{row.machines.name} ({row.machines.code})</span>}
                  <span>Assigned {formatDateTime(row.assigned_at)}</span>
                  {row.returned_at && <span>Returned {formatDateTime(row.returned_at)}{row.condition_on_return ? ` — ${row.condition_on_return}` : ''}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Return Plate Modal */}
      <Modal open={!!returnModal} onClose={() => setReturnModal(null)} title={returnModal ? `Return ${returnModal.color} Plate` : ''} size="sm"
        footer={<>
          <button onClick={() => setReturnModal(null)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          <button onClick={submitReturn} disabled={returning}
            className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            {returning ? 'Returning…' : 'Return Plate'}
          </button>
        </>}>
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-secondary)]">
            {returnModal?.current_job && `This plate is currently with ${returnModal.current_job.job_number}. Returning it marks that job's assignment as finished.`}
          </p>
          <div className="space-y-1.5">
            <label htmlFor="platesclient-4" className="text-sm font-medium text-[var(--color-text-primary)]">Condition on Return</label>
            <select id="platesclient-4" value={returnCondition} onChange={e => setReturnCondition(e.target.value as any)} className={inputCls}>
              <option value="good">Good — back to storage</option>
              <option value="worn">Worn — back to storage</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deletePlate}
        title="Delete plate?"
        message={deleteTarget ? `The ${deleteTarget.color} plate will be removed from the registry. Its assignment history stays on the jobs it was used for.` : ''}
        confirmLabel="Delete plate"
        loading={deletingPlate}
      />

    </div>
  )
}
