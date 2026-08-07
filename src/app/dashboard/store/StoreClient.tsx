'use client'
import { useState } from 'react'
import { Package, Plus, ChevronDown, ChevronRight, Check, X, Trash2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { TabStrip } from '@/components/ui/TabStrip'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatDate, formatDateTime, planLabel } from '@/lib/utils/format'
import { JOB_PRIORITY_CONFIG } from '@/modules/jobs/types/job.types'
import type { BoardIssueJob } from '@/lib/utils/jobsAwaitingBoardIssue'
import { boardSpecText } from '@/lib/utils/boardSpecText'
import Link from 'next/link'
import { Pagination } from '@/components/ui/Pagination'
import { useServerPagedList } from '@/lib/hooks/useServerPagedList'

interface MRNItem { id: string; material_name: string; material_type: string | null; specification: string | null; quantity_required: number; quantity_issued: number; unit_id: string | null; board_item_id: string | null; notes?: string | null }
interface MRN { id: string; mrn_number: string; status: string; required_date: string | null; notes: string | null; created_at: string; jobs?: { job_number: string; job_title: string; gsm?: number | null } | null; material_requisition_items?: MRNItem[] }
interface Job { id: string; job_number: string; job_title: string }
interface Unit { id: string; name: string; symbol: string }
interface BoardInventoryItem { id: string; description: string; current_stock: number; reserved_stock?: number; unit_id: string | null; gsm?: number | null; sheet_width_in?: number | null; sheet_height_in?: number | null; board_type_id?: string | null }

const STATUS_CFG = {
  pending:           { label: 'Pending',           color: 'text-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)]' },
  approved:          { label: 'Approved',           color: 'text-[var(--color-info)] bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-info)_20%,transparent)]' },
  partially_issued:  { label: 'Partially Issued',  color: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)]' },
  issued:            { label: 'Issued',             color: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]' },
  cancelled:         { label: 'Cancelled',          color: 'text-[var(--color-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
}

const MATERIAL_TYPES = ['board','paper','ink','lamination','foil','glue','chemical','other']

/** Sirf ye do cheezen `board_inventory` mein rakhi jati hain — us table ki har
 *  row ke paas gsm, sheet size aur board/paper type hai. Ink, glue, chemical
 *  ka koi stock table system mein hai hi nahi (sirf `ink_types`, jo naamon ki
 *  fehrist hai), is liye un lines par stock ka sawal hi nahi banta. */
const STOCK_TRACKED_TYPES = ['', 'board', 'paper']

/** Har material apni ikai mein aata hai — board SHEETS, ink KILO, glue LITER.
 *  MRN par ye khana pehle din se maujood tha magar form mein control hi nahi
 *  tha, is liye live ki har line par unit NULL hai: "2" ka matlab 2 kilo hai ya
 *  2 dabbe, kaghaz par se pata nahi chalta tha. Jahan yaqeen hai wahin default
 *  bharte hain; baqi planner khud chunta hai. */
const DEFAULT_UNIT_SYMBOL: Record<string, string> = {
  board: 'Sht', paper: 'Sht', ink: 'KG', glue: 'L', chemical: 'L',
}
const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'
const EMPTY_ITEM = { material_name: '', material_type: '', specification: '', quantity_required: '1', unit_id: '', board_item_id: '', notes: '' }

/** Stock ki row ka wahi label jo Issue window par likha hai — free stock ke
 *  sath, kul stock ke sath nahi. Dono jagah ek hi shakal, warna Store do
 *  alag fehristein parhta hai (Issue window apna alag label banata tha; ab
 *  wo bhi yehi bulata hai).
 *
 *  GSM akela pehchan nahi hai: live par "Bleach Board" naam ki 23 rows hain
 *  aur demand khud gsm + SHEET SIZE se match karti hai (135). Sirf gsm dikha
 *  kar chunwana 300 gsm ki do alag sizes ko ek jaisa dikhata tha. */
function stockLabel(b: { description: string; gsm?: number | null; sheet_width_in?: number | null; sheet_height_in?: number | null; current_stock: number; reserved_stock?: number }) {
  const free = Math.max(0, Number(b.current_stock) - Number(b.reserved_stock ?? 0))
  const spec = boardSpecText(b)
  return `${b.description}${spec ? ` — ${spec}` : ''} (${free.toLocaleString()} free)`
}

export default function StoreClient({ initialMRNs, initialTotal, boardIssueJobs, jobs, units, boardInventory }: { initialMRNs: MRN[]; initialTotal: number; boardIssueJobs: BoardIssueJob[]; jobs: Job[]; units: Unit[]; boardInventory: BoardInventoryItem[] }) {
  // Local copy so a row's button follows what just happened (MRN created,
  // approved, issued) without waiting for a server render.
  const [boardIssueRows, setBoardIssueRows] = useState(boardIssueJobs)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = useState('')

  // Status tab filters in the query now, so it sees every requisition instead
  // of only the newest 200 this page had loaded.
  const list = useServerPagedList<MRN>({
    endpoint: '/api/v1/store',
    initialRows: initialMRNs,
    initialTotal,
    errorMessage: 'Failed to load requisitions',
  })
  const mrns = list.rows
  const setMRNs = list.setRows

  const changeStatus = (s: string) => { setFilterStatus(s); list.applyFilter({ status: s }) }
  const [newMRNModal, setNewMRNModal] = useState(false)
  const [issueModal, setIssueModal] = useState<MRN | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ job_id: '', required_date: '', notes: '' })
  const [lineItems, setLineItems] = useState([{ ...EMPTY_ITEM }])
  const [issueBoardLinks, setIssueBoardLinks] = useState<Record<string, string>>({})
  const [issueQtys, setIssueQtys] = useState<Record<string, string>>({})
  // Reason captured per line when the stock being issued is a different GSM
  // than the job planned. Never blocks the issue — it only records the why.
  const [issueNotes, setIssueNotes] = useState<Record<string, string>>({})

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })


  const unitIdBySymbol = (sym: string) => units.find(u => u.symbol === sym)?.id ?? ''
  const unitSymbol = (id: string | null) => (id ? units.find(u => u.id === id)?.symbol ?? '' : '')

  const addLine = () => setLineItems(p => [...p, { ...EMPTY_ITEM }])
  const removeLine = (idx: number) => setLineItems(p => p.filter((_, i) => i !== idx))
  const setLine = (idx: number, key: string, val: string) => setLineItems(p => p.map((l, i) => {
    if (i !== idx) return l
    const next = { ...l, [key]: val }
    if (key === 'material_type') {
      // Ikai type se aati hai — jo khud chuni ja chuki ho usay haath nahi lagate.
      if (!l.unit_id) next.unit_id = unitIdBySymbol(DEFAULT_UNIT_SYMBOL[val] ?? '')
      // Ink/glue ki line par board ki stock row ka koi matlab nahi. Ye link
      // reh jata to Issue us line par BOARD ka stock kaat deta aur board ke
      // rate se ink ka kharcha job par chadha deta — dono ghalat.
      if (!STOCK_TRACKED_TYPES.includes(val)) next.board_item_id = ''
    }
    return next
  }))

  // Stock chunte hi line khud bhar jati hai. Jo khaana pehle se likha hai use
  // haath nahi lagata — wohi usool jo Repeat picker par hai: chunna madad hai,
  // jo type ho chuka usay mitana nahi.
  const pickBoard = (idx: number, boardId: string) => {
    const b = boardInventory.find(x => x.id === boardId)
    setLineItems(p => p.map((l, i) => i !== idx ? l : {
      ...l,
      board_item_id: boardId,
      material_name: l.material_name || (b?.description ?? ''),
      material_type: l.material_type || (b ? 'board' : ''),
      // gsm + sheet size dono — yehi jora demand ko match karta hai (135), aur
      // yehi MRN par chhap kar Store tak jata hai.
      specification: l.specification || (b ? boardSpecText(b) : ''),
      // Stock row ki apni ikai (live par 51 mein se 51 par "Sht"), warna
      // board ka default.
      unit_id: l.unit_id || b?.unit_id || unitIdBySymbol('Sht'),
    }))
  }

  const createMRN = async () => {
    if (!lineItems.some(l => l.material_name)) { toast.error('Add at least one material'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/store', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          job_id: form.job_id || null,
          items: lineItems.filter(l => l.material_name).map(l => ({
            ...l, quantity_required: parseFloat(l.quantity_required || '1'),
            unit_id: l.unit_id || null,
            // Khali string ko null banao — zod ka .uuid() usay reject karta hai
            // aur poori MRN 400 par gir jati.
            board_item_id: l.board_item_id || null,
          })),
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data, items: created } = await res.json()
      const job = jobs.find(j => j.id === form.job_id)
      // Asal inserted lines — pehle yahan `[]` likha jata tha, is liye abhi abhi
      // banayi hui MRN list par "0 materials" dikhati thi.
      setMRNs(prev => [{ ...data, jobs: job || null, material_requisition_items: (created ?? []) as MRNItem[] }, ...prev])
      // If this MRN was raised for a job sitting in the action panel above,
      // that row now has paperwork — swap its button from Create to Approve.
      if (form.job_id) {
        setBoardIssueRows(prev => prev.map(j => j.job_id === form.job_id
          ? { ...j, mrn: { id: data.id, mrn_number: data.mrn_number, status: data.status } }
          : j))
      }
      setNewMRNModal(false)
      setForm({ job_id: '', required_date: '', notes: '' })
      setLineItems([{ ...EMPTY_ITEM }])
      toast.success(`MRN ${data.mrn_number} created`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  // Which MRN is mid-approve. Without this the button stayed live during the
  // request and a second tap fired a second approve — easy to do on a phone,
  // where there's no cursor feedback that anything happened.
  const [approving, setApproving] = useState<string | null>(null)

  const approveMRN = async (mrnId: string) => {
    if (approving) return
    setApproving(mrnId)
    try {
      const res = await fetch(`/api/v1/store/${mrnId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      if (!res.ok) throw new Error()
      setMRNs(prev => prev.map(m => m.id === mrnId ? { ...m, status: 'approved' } : m))
      toast.success('MRN approved')
    } catch { toast.error('Failed') }
    finally { setApproving(null) }
  }

  // Open the issue modal from anywhere (the action panel, the list row) with
  // the remaining quantity pre-filled per line, the way the list row does it.
  const openIssue = (mrn: MRN) => {
    const qtys: Record<string, string> = {}
    for (const i of (mrn.material_requisition_items || [])) {
      qtys[i.id] = String(i.quantity_required - i.quantity_issued)
    }
    setIssueQtys(qtys)
    setIssueModal(mrn)
  }

  // "Create MRN" straight off a Board Issue job card, pre-filled with the
  // job's own board and sheet quantity — the same content the workflow route
  // auto-creates when the stage is started, for the case where Store gets there
  // first.
  const openNewMRNForJob = (job: BoardIssueJob) => {
    setForm({ job_id: job.job_id, required_date: '', notes: '' })
    setLineItems([{
      ...EMPTY_ITEM,
      material_name: job.board_type_name ?? '',
      material_type: 'board',
      // Wahi spec jo auto-MRN likhti hai, taake dono raaste ek jaisi MRN banayen.
      specification: boardSpecText(job),
      unit_id: unitIdBySymbol('Sht'),
      quantity_required: job.sheet_qty != null ? String(job.sheet_qty) : '1',
      // Jis stock row par is job ka board pehle se reserve hai. Chunna phir
      // bhi mumkin hai — Store bara board ya doosra weight jaan bujh kar
      // uthata hai — bas ab shuruaat sahi jagah se hoti hai.
      board_item_id: job.board_item_id ?? '',
    }])
    setNewMRNModal(true)
  }

  const issueMaterials = async () => {
    if (!issueModal) return
    setLoading(true)
    try {
      const items = (issueModal.material_requisition_items || []).map(item => ({
        id: item.id,
        quantity_issued: parseFloat(issueQtys[item.id] ?? String(item.quantity_required)),
        board_item_id: issueBoardLinks[item.id] ?? item.board_item_id ?? null,
        notes: issueNotes[item.id] || null,
      }))
      const res = await fetch(`/api/v1/store/${issueModal.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'issue', items }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setMRNs(prev => prev.map(m => m.id === issueModal.id ? { ...m, status: data.status, material_requisition_items: m.material_requisition_items?.map(i => ({ ...i, quantity_issued: parseFloat(issueQtys[i.id] ?? String(i.quantity_required)) })) } : m))
      setIssueModal(null)
      setIssueQtys({})
      setIssueBoardLinks({})
      setIssueNotes({})
      toast.success('Materials issued')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  // Jobs whose board still has to be issued. A job whose MRN has been fully
  // issued drops off — the stage can be completed and Store is done with it.
  // Status comes from the live MRN list where we have it, so a row disappears
  // the moment it's issued rather than on the next page load.
  const liveMrnStatus = (job: BoardIssueJob) =>
    (job.mrn ? mrns.find(m => m.id === job.mrn!.id)?.status : null) ?? job.mrn?.status ?? null
  const actionable = boardIssueRows.filter(j => liveMrnStatus(j) !== 'issued')

  return (
    <div className="space-y-4">
      {/* Board Issue — Action Needed. The list below is the paperwork; this is
          which jobs are standing still waiting for it. Starting the Board Issue
          stage auto-creates the MRN, so most rows here just need approving and
          issuing; a job that reached Store before its stage was started gets a
          Create MRN button pre-filled from the job. */}
      {actionable.length > 0 && (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_6%,transparent)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)] flex items-center gap-2">
            <AlertTriangle size={14} className="text-[var(--color-warning)] flex-shrink-0" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Board Issue — Action Needed</h2>
            <span className="text-xs text-[var(--color-text-muted)]">
              {actionable.length} job{actionable.length > 1 ? 's' : ''} waiting on Store
            </span>
          </div>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {actionable.map(job => {
              const pcfg = JOB_PRIORITY_CONFIG[job.priority as keyof typeof JOB_PRIORITY_CONFIG]
              // The full MRN (with its line items) only exists locally if it
              // came down with the 50 most recent — otherwise point at the list.
              const fullMrn = job.mrn ? mrns.find(m => m.id === job.mrn!.id) ?? null : null
              const liveStatus = liveMrnStatus(job)
              return (
                <div key={job.job_id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/dashboard/jobs/${job.job_id}`}
                        className="text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)] truncate">
                        {job.job_number} — {job.job_title}
                      </Link>
                      {pcfg && <span className={cn('text-[10px] font-medium flex-shrink-0', pcfg.color)}>{pcfg.label}</span>}
                      {job.mrn && (
                        <span className="text-[10px] text-[var(--color-text-muted)] font-mono flex-shrink-0">{job.mrn.mrn_number}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                      {job.customer_name && <span>{job.customer_name}</span>}
                      {job.board_type_name && <span>· {job.board_type_name}</span>}
                      {job.gsm != null && <span>· {job.gsm} gsm</span>}
                      {job.sheet_width_in != null && job.sheet_height_in != null && (
                        <span>· {Number(job.sheet_width_in)} × {Number(job.sheet_height_in)} in</span>
                      )}
                      {job.sheet_qty != null && <span>· {job.sheet_qty} sheets</span>}
                      {job.planned_date && <span className="text-[var(--color-accent)]">· {planLabel(job.planned_date)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!job.mrn ? (
                      <button onClick={() => openNewMRNForJob(job)}
                        className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-8 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm md:text-xs font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
                        <Plus size={14} /> Create MRN
                      </button>
                    ) : liveStatus === 'pending' ? (
                      <button onClick={() => approveMRN(job.mrn!.id)} disabled={approving === job.mrn.id}
                        className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-8 rounded-md border border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)] text-sm md:text-xs text-[var(--color-success)] hover:bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] disabled:opacity-50 transition-colors">
                        <Check size={14} /> {approving === job.mrn.id ? 'Approving…' : 'Approve'}
                      </button>
                    ) : fullMrn ? (
                      <button onClick={() => openIssue(fullMrn)}
                        className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-8 rounded-md bg-[var(--color-warning)] text-[var(--color-on-warning)] text-sm md:text-xs font-medium hover:opacity-90 transition-colors">
                        <Package size={14} /> Issue
                      </button>
                    ) : (
                      <span className="text-[11px] text-[var(--color-text-muted)]">Find {job.mrn.mrn_number} below</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-2.5 md:gap-3">
        <TabStrip
          className="flex-1 min-w-0"
          tabs={['', 'pending', 'approved', 'partially_issued', 'issued'].map(s => ({
            key: s,
            label: s === '' ? 'All' : STATUS_CFG[s as keyof typeof STATUS_CFG]?.label || s,
          }))}
          active={filterStatus}
          onChange={changeStatus}
        />
        <button onClick={() => setNewMRNModal(true)}
          className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors md:ml-auto flex-shrink-0">
          <Plus size={15} /> New MRN
        </button>
      </div>

      {/* MRN list */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        {mrns.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">No material requisitions found</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {mrns.map(mrn => {
              const statusCfg = STATUS_CFG[mrn.status as keyof typeof STATUS_CFG] || STATUS_CFG.pending
              const isOpen = expanded.has(mrn.id)
              const items = mrn.material_requisition_items || []
              const issuedCount = items.filter(i => i.quantity_issued >= i.quantity_required).length
              return (
                <div key={mrn.id}>
                  {/* MRN header row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 md:px-5 py-3.5 hover:bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_30%,transparent)]">
                    <button onClick={() => toggle(mrn.id)} aria-label={isOpen ? 'Collapse' : 'Expand'}
                      className="w-11 h-11 md:w-auto md:h-auto -ml-2 md:ml-0 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] flex-shrink-0">
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold font-mono text-[var(--color-accent)]">{mrn.mrn_number}</span>
                        {mrn.jobs && (
                          <Link href={`/dashboard/jobs/${mrn.jobs.job_number}`} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
                            → {mrn.jobs.job_number}
                          </Link>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-[var(--color-text-muted)]">
                        <span>{items.length} material{items.length !== 1 ? 's' : ''}</span>
                        {items.length > 0 && <span>{issuedCount}/{items.length} issued</span>}
                        {mrn.required_date && <span>Required: {formatDate(mrn.required_date)}</span>}
                        <span>{formatDateTime(mrn.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', statusCfg.color)}>{statusCfg.label}</span>
                      {mrn.status === 'pending' && (
                        <button onClick={() => approveMRN(mrn.id)} disabled={approving === mrn.id}
                          className="flex items-center gap-1 px-3 md:px-2.5 h-11 md:h-7 rounded-md border border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)] text-xs text-[var(--color-success)] hover:bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] disabled:opacity-50 transition-colors">
                          <Check size={11} /> {approving === mrn.id ? 'Approving…' : 'Approve'}
                        </button>
                      )}
                      {['approved','partially_issued'].includes(mrn.status) && (
                        <button onClick={() => openIssue(mrn)}
                          className="flex items-center gap-1 px-3 md:px-2.5 h-11 md:h-7 rounded-md bg-[var(--color-warning)] text-[var(--color-on-warning)] text-xs font-medium hover:opacity-90 transition-colors">
                          <Package size={11} /> Issue
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded line items */}
                  {isOpen && items.length > 0 && (
                    <div className="border-t border-[var(--color-border-subtle)] bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_30%,transparent)]">
                      <div className="hidden md:grid grid-cols-12 gap-3 px-10 py-2 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider border-b border-[var(--color-border-subtle)]">
                        <div className="col-span-3">Material</div>
                        <div className="col-span-2">Type</div>
                        <div className="col-span-3">Specification</div>
                        <div className="col-span-2">Required</div>
                        <div className="col-span-2">Issued</div>
                      </div>
                      {items.map(item => (
                        <div key={item.id} className="grid grid-cols-2 md:grid-cols-12 gap-x-3 gap-y-1 px-5 md:px-10 py-2.5 items-center text-sm border-b border-[var(--color-border-subtle)] last:border-0">
                          <div className="col-span-2 md:col-span-3 text-[var(--color-text-primary)]">
                            {item.material_name}
                            <span className="md:hidden text-[var(--color-text-muted)] capitalize"> {item.material_type ? `· ${item.material_type}` : ''}</span>
                          </div>
                          <div className="hidden md:block md:col-span-2 text-[var(--color-text-muted)] capitalize">{item.material_type || '—'}</div>
                          <div className="col-span-2 md:col-span-3 text-[var(--color-text-muted)] text-xs">{item.specification || '—'}</div>
                          {/* Ikai ke sath — "2" aur "2 KG" ek baat nahi. */}
                          <div className="md:col-span-2 text-[var(--color-text-primary)]">
                            <span className="md:hidden text-xs text-[var(--color-text-muted)]">Required: </span>{item.quantity_required}
                            {unitSymbol(item.unit_id) && <span className="text-[var(--color-text-muted)]"> {unitSymbol(item.unit_id)}</span>}
                          </div>
                          <div className="md:col-span-2 text-right md:text-left">
                            <span className="md:hidden text-xs text-[var(--color-text-muted)]">Issued: </span>
                            <span className={cn('font-medium', item.quantity_issued >= item.quantity_required ? 'text-[var(--color-success)]' : item.quantity_issued > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)]')}>
                              {item.quantity_issued}
                            </span>
                            {unitSymbol(item.unit_id) && <span className="text-[var(--color-text-muted)]"> {unitSymbol(item.unit_id)}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Pagination page={list.page} total={list.total} pageSize={list.pageSize}
        loading={list.loading} onPageChange={p => list.goToPage(p, { status: filterStatus })}
        noun="requisitions" />

      {/* New MRN Modal */}
      <Modal open={newMRNModal} onClose={() => setNewMRNModal(false)} title="New Material Requisition" size="lg"
        footer={
          <>
            <button onClick={() => setNewMRNModal(false)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createMRN} disabled={loading}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {loading ? 'Creating…' : 'Create MRN'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="storeclient-1" className="text-sm font-medium text-[var(--color-text-primary)]">Link to Job</label>
              <select id="storeclient-1" className={inputCls} value={form.job_id} onChange={e => setForm(p => ({ ...p, job_id: e.target.value }))}>
                <option value="">No job (general requisition)</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="storeclient-2" className="text-sm font-medium text-[var(--color-text-primary)]">Required By</label>
              <input id="storeclient-2" type="date" className={inputCls} value={form.required_date} onChange={e => setForm(p => ({ ...p, required_date: e.target.value }))} />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Materials Required</label>
              <button onClick={addLine} className="text-xs text-[var(--color-accent)] hover:underline flex items-center gap-1"><Plus size={12} /> Add</button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-[var(--color-border-subtle)] md:border-0 p-2.5 md:p-0 space-y-2 md:space-y-1.5">
                <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                  <div className="col-span-2 md:col-span-3">
                    <input className={inputCls} value={item.material_name} onChange={e => setLine(idx, 'material_name', e.target.value)} placeholder="Material name *" />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <select className={inputCls} value={item.material_type} onChange={e => setLine(idx, 'material_type', e.target.value)}>
                      <option value="">Type…</option>
                      {MATERIAL_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                    </select>
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <input className={inputCls} value={item.specification} onChange={e => setLine(idx, 'specification', e.target.value)} placeholder="Specification" />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <input type="number" className={inputCls} value={item.quantity_required} onChange={e => setLine(idx, 'quantity_required', e.target.value)} placeholder="Qty" />
                  </div>
                  {/* Ikai. Board sheets mein aata hai, ink kilo mein, glue liter
                      mein — aur ye khana MRN par pehle din se maujood tha magar
                      form mein control kabhi tha hi nahi, is liye live ki har
                      line par NULL para hai. Kaghaz par "2" likha dekh kar Store
                      ko andaza lagana parta tha. */}
                  <div className="col-span-1 md:col-span-2">
                    <select className={inputCls} value={item.unit_id} onChange={e => setLine(idx, 'unit_id', e.target.value)} aria-label="Unit">
                      <option value="">Unit…</option>
                      {units.map(u => <option key={u.id} value={u.id}>{u.symbol}</option>)}
                    </select>
                  </div>
                  <div className="col-span-1 md:col-span-1 flex justify-end">
                    {lineItems.length > 1 && (
                      <button onClick={() => removeLine(idx)} aria-label="Remove line" className="w-11 h-11 md:w-auto md:h-auto flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"><Trash2 size={14} /></button>
                    )}
                  </div>
                </div>
                {/* Kaunsi stock row. Ye sawal pehle sirf ISSUE ke waqt poochha
                    jata tha — yani jo baat MRN banate waqt maloom thi wo do
                    din baad dobara dhoondni parti thi. Yahan chunne ka matlab
                    hai ke issue karne wale ko kuch chunna hi nahi parta.

                    Sirf board/paper par. `board_inventory` mein aur kuch hai hi
                    nahi, aur har line par ye poori fehrist dikhana ink ki line
                    par board ki row chunwa sakta tha — jis se Issue board ka
                    stock kaat deta. */}
                {STOCK_TRACKED_TYPES.includes(item.material_type) ? (
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
                  <label htmlFor={`mrn-stock-${idx}`} className="text-xs text-[var(--color-text-muted)] md:w-24 flex-shrink-0">Stock item</label>
                  <select id={`mrn-stock-${idx}`} className={cn(inputCls, 'h-11 md:h-8 text-xs md:flex-1')}
                    value={item.board_item_id}
                    onChange={e => pickBoard(idx, e.target.value)}>
                    <option value="">Not tracked in inventory (ink, glue, etc.)</option>
                    {boardInventory.map(b => (
                      <option key={b.id} value={b.id}>{stockLabel(b)}</option>
                    ))}
                  </select>
                </div>
                ) : (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    <span className="capitalize">{item.material_type}</span> ka stock system mein nahi rakha jata — Issue par sirf di gayi maqdaar record hogi, katauti koi nahi.
                  </p>
                )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="storeclient-3" className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
            <input id="storeclient-3" className={inputCls} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" />
          </div>
        </div>
      </Modal>

      {/* Issue Modal */}
      {issueModal && (
        <Modal open={true} onClose={() => setIssueModal(null)} title={`Issue Materials — ${issueModal.mrn_number}`} size="md"
          footer={
            <>
              <button onClick={() => setIssueModal(null)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={issueMaterials} disabled={loading}
                className="px-4 h-9 rounded-md bg-[var(--color-warning)] text-[var(--color-on-warning)] text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
                {loading ? 'Issuing…' : 'Issue Materials'}
              </button>
            </>
          }>
          <div className="space-y-3">
            {(issueModal.material_requisition_items || []).map(item => {
              const selectedBoardId = issueBoardLinks[item.id] ?? item.board_item_id ?? ''
              const selectedBoard = boardInventory.find(b => b.id === selectedBoardId)
              const unit = unitSymbol(item.unit_id)
              // Purani lines par material_type NULL para hai — un par fehrist
              // dikhti rahe, warna board wali line ka link badla hi na ja sake.
              const stockTracked = STOCK_TRACKED_TYPES.includes(item.material_type ?? '')
              const plannedGsm = issueModal.jobs?.gsm != null ? Number(issueModal.jobs.gsm) : null
              const issuedGsm = selectedBoard?.gsm != null ? Number(selectedBoard.gsm) : null
              // Soft only — the shop substitutes weights on purpose (cost, or
              // whatever is on the floor). We record it, we don't prevent it.
              const gsmMismatch = plannedGsm != null && issuedGsm != null && plannedGsm !== issuedGsm
              return (
              <div key={item.id} className="space-y-2">
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 rounded-lg border border-[var(--color-border-subtle)] md:border-0 p-3 md:p-0">
                <div className="flex-1 min-w-0 md:min-w-[140px]">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    {item.material_name}
                    {/* GSM aur sheet size yahin chahiyen — stock ki row isi
                        se chuni jati hai, naam se nahi. */}
                    {item.specification && (
                      <span className="font-normal text-[var(--color-text-muted)]"> · {item.specification}</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Required: {item.quantity_required}{unit && ` ${unit}`} | Issued so far: {item.quantity_issued}{unit && ` ${unit}`}
                  </p>
                </div>
                {/* Stock ki row sirf board/paper par poochhi jati hai — baqi
                    kuch is table mein hai hi nahi. Ink ki line par ye fehrist
                    dikhana board ka stock ink ke naam kat jane ka raasta tha. */}
                {stockTracked ? (
                <select
                  className="h-11 md:h-8 px-2 rounded-md border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] transition-colors w-full md:w-auto md:max-w-[260px]"
                  value={selectedBoardId}
                  onChange={e => setIssueBoardLinks(prev => ({ ...prev, [item.id]: e.target.value }))}>
                  <option value="">Not tracked in inventory</option>
                  {/* Wahi label jo New MRN par hai — naam, gsm + sheet size, aur
                      KHALI stock (kul nahi: har job ka board apne naam reserve
                      hota hai, 135). Ye label yahan dobara likha hua tha, is
                      liye sheet size sirf ek jagah lagti aur do fehristein
                      alag ho jatin. */}
                  {boardInventory.map(b => (
                    <option key={b.id} value={b.id}>{stockLabel(b)}</option>
                  ))}
                </select>
                ) : (
                  <span className="text-xs text-[var(--color-text-muted)] md:max-w-[260px]">Stock mein nahi rakha jata — sirf record hoga</span>
                )}
                <input type="number"
                  className="w-full md:w-24 h-11 md:h-8 px-2.5 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  value={issueQtys[item.id] ?? ''}
                  onChange={e => setIssueQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder={unit ? `Qty (${unit})` : 'Qty'} />
              </div>
              {gsmMismatch && (
                <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] p-3 space-y-2">
                  <p className="text-xs text-[var(--color-text-primary)]">
                    Job planned <span className="font-semibold">{plannedGsm} gsm</span>, this stock is{' '}
                    <span className="font-semibold">{issuedGsm} gsm</span>. You can still issue it — please note why.
                  </p>
                  <input className={inputCls} value={issueNotes[item.id] ?? ''}
                    onChange={e => setIssueNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="Reason (e.g. cost saving approved by…)" />
                </div>
              )}
              </div>
              )
            })}
            <p className="text-xs text-[var(--color-text-muted)]">
              Link an item to inventory to auto-deduct stock when issued. Leave unlinked for materials you don&apos;t track (ink, glue, etc.).
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
