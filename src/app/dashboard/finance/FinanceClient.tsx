'use client'
import { useState } from 'react'
import {
  FileText, Plus, DollarSign, TrendingUp, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronRight, Send, Trash2, CreditCard, Calculator, Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatDate, formatTimeAgo } from '@/lib/utils/format'
import Link from 'next/link'

/* ─── Types ──────────────────────────────────────────────────────────────────── */
interface InvItem { id: string; description: string; quantity: number; unit_price: number; subtotal: number; job_id: string | null }
interface Payment { id: string; amount: number; payment_date: string; payment_method: string; reference: string | null }
interface Invoice {
  id: string; invoice_number: string; status: string
  invoice_date: string; due_date: string | null; payment_terms: number
  subtotal: number; discount_pct: number; tax_pct: number; tax_amount: number; total_amount: number
  paid_amount: number; balance_due: number; notes: string | null; terms: string | null; created_at: string
  customers?: { name: string; customer_code: string } | null
  invoice_items?: InvItem[]; payments?: Payment[]
}
interface Customer { id: string; name: string; customer_code: string }
interface Job { id: string; job_number: string; job_title: string; quoted_amount: number | null; customers?: { name: string } | null }

const PKR = (n: number) => `PKR ${n.toLocaleString('en-PK', { minimumFractionDigits: 0 })}`

const STATUS_CFG = {
  draft:    { label: 'Draft',    color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
  sent:     { label: 'Sent',     color: 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/20' },
  partial:  { label: 'Partial',  color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20' },
  paid:     { label: 'Paid',     color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20' },
  overdue:  { label: 'Overdue',  color: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20' },
  cancelled:{ label: 'Cancelled',color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
  void:     { label: 'Void',     color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
}

const PAY_METHODS = ['cash','cheque','bank_transfer','online','other']
const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'
const EMPTY_LINE = { description: '', job_id: '', quantity: '1', unit_price: '0' }

interface Tax { id: string; name: string; rate_percent: number }

export default function FinanceClient({ initialInvoices, customers, completedJobs, taxes, stats }: {
  initialInvoices: Invoice[]; customers: Customer[]; completedJobs: Job[]; taxes: Tax[]
  stats: { totalBilled: number; totalReceived: number; totalOverdue: number; monthlyCollected: number }
}) {
  const [invoices, setInvoices] = useState(initialInvoices)
  const [agingModal, setAgingModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  /* New Invoice modal */
  const [invModal, setInvModal] = useState(false)
  const [invForm, setInvForm] = useState({
    customer_id: '', invoice_date: new Date().toISOString().slice(0,10),
    payment_terms: '30', discount_pct: '0', tax_id: '', tax_pct: '0', notes: '',
    terms: 'Payment due within 30 days of invoice date.',
  })
  const [invLines, setInvLines] = useState([{ ...EMPTY_LINE }])

  /* Payment modal */
  const [payModal, setPayModal] = useState<Invoice | null>(null)
  const [payForm, setPayForm] = useState({
    amount: '', payment_date: new Date().toISOString().slice(0,10),
    payment_method: 'bank_transfer', reference: '', bank_name: '', notes: '',
  })

  /* Costing modal */
  const [costModal, setCostModal] = useState(false)
  const [costJobId, setCostJobId] = useState('')
  const [costForm, setCostForm] = useState({
    board_cost: '', board_sheets: '', board_rate: '',
    printing_cost: '', printing_plates: '', plate_cost: '', ink_cost: '',
    lamination_cost: '', foiling_cost: '', uv_cost: '',
    die_cutting_cost: '', pasting_cost: '', other_finishing: '',
    labour_cost: '', overhead_pct: '15', quoted_amount: '', costing_notes: '',
  })
  const [costLines, setCostLines] = useState<{ description: string; amount: string }[]>([])
  const [aiCostSuggestion, setAiCostSuggestion] = useState<{ summary: string; suggested_total_low: number | null; suggested_total_high: number | null; flags: { field: string; message: string }[]; comparable_count: number } | null>(null)
  const [aiCostLoading, setAiCostLoading] = useState(false)

  /* Helpers */
  const toggle = (id: string) => setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const addInvLine = () => setInvLines(p => [...p, { ...EMPTY_LINE }])
  const removeInvLine = (i: number) => setInvLines(p => p.filter((_, idx) => idx !== i))
  const setInvLine = (i: number, k: string, v: string) => setInvLines(p => p.map((l, idx) => idx === i ? { ...l, [k]: v } : l))

  const invSubtotal = invLines.reduce((s, l) => s + parseFloat(l.quantity||'0') * parseFloat(l.unit_price||'0'), 0)
  const discAmt = invSubtotal * parseFloat(invForm.discount_pct||'0') / 100
  const taxAmt  = (invSubtotal - discAmt) * parseFloat(invForm.tax_pct||'0') / 100
  const invTotal = invSubtotal - discAmt + taxAmt

  const costDirectTotal = ['board_cost','printing_cost','plate_cost','ink_cost','lamination_cost','foiling_cost','uv_cost','die_cutting_cost','pasting_cost','other_finishing','labour_cost'].reduce((s, k) => s + parseFloat((costForm as any)[k]||'0'), 0)
  const costExtraTotal  = costLines.reduce((s, l) => s + parseFloat(l.amount||'0'), 0)
  const costOverhead    = (costDirectTotal + costExtraTotal) * parseFloat(costForm.overhead_pct||'15') / 100
  const costTotal       = costDirectTotal + costExtraTotal + costOverhead
  const costQuoted      = parseFloat(costForm.quoted_amount||'0')
  const costMargin      = costQuoted > 0 ? costQuoted - costTotal : null
  const costMarginPct   = costQuoted > 0 && costTotal > 0 ? (costMargin! / costQuoted * 100) : null

  const filteredInvoices = filterStatus ? invoices.filter(i => i.status === filterStatus) : invoices

  /* ─── Create Invoice ────────────────────────────────────────────────────────── */
  const createInvoice = async () => {
    if (!invForm.customer_id) { toast.error('Select a customer'); return }
    if (!invLines.some(l => l.description)) { toast.error('Add at least one line item'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/finance/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...invForm,
          items: invLines.filter(l => l.description).map(l => ({
            ...l, job_id: l.job_id || null,
            quantity: parseFloat(l.quantity||'1'),
            unit_price: parseFloat(l.unit_price||'0'),
          })),
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      const cust = customers.find(c => c.id === invForm.customer_id)
      setInvoices(prev => [{ ...data, customers: cust || null, invoice_items: [], payments: [] }, ...prev])
      setInvModal(false)
      setInvLines([{ ...EMPTY_LINE }])
      setInvForm({ customer_id: '', invoice_date: new Date().toISOString().slice(0,10), payment_terms: '30', discount_pct: '0', tax_id: '', tax_pct: '0', notes: '', terms: 'Payment due within 30 days of invoice date.' })
      toast.success(`Invoice ${data.invoice_number} created`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  /* ─── Send Invoice ──────────────────────────────────────────────────────────── */
  const sendInvoice = async (inv: Invoice) => {
    try {
      await fetch(`/api/v1/finance/invoices/${inv.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      })
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'sent' } : i))
      toast.success('Invoice marked as sent')
    } catch { toast.error('Failed') }
  }

  /* ─── Record Payment ────────────────────────────────────────────────────────── */
  const recordPayment = async () => {
    if (!payModal) return
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) { toast.error('Enter a valid amount'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/finance/invoices/${payModal.id}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payForm, amount: parseFloat(payForm.amount) }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { invoice: updInv } = await res.json()
      setInvoices(prev => prev.map(i => i.id === payModal.id ? { ...i, ...(updInv as any) } : i))
      setPayModal(null)
      setPayForm({ amount: '', payment_date: new Date().toISOString().slice(0,10), payment_method: 'bank_transfer', reference: '', bank_name: '', notes: '' })
      toast.success('Payment recorded')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  /* ─── AI Costing Suggestion ─────────────────────────────────────────────────── */
  const runAiCostSuggestion = async () => {
    if (!costJobId) { toast.error('Select a job first'); return }
    setAiCostLoading(true)
    setAiCostSuggestion(null)
    try {
      const res = await fetch('/api/v1/finance/costing/ai-suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: costJobId, current_costs: costForm }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'AI suggestion failed'); return }
      setAiCostSuggestion({ ...json.data, comparable_count: json.comparable_count })
    } catch { toast.error('AI suggestion failed') }
    finally { setAiCostLoading(false) }
  }

  /* ─── Save Costing ──────────────────────────────────────────────────────────── */
  const saveCosting = async () => {
    if (!costJobId) { toast.error('Select a job'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/finance/costing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: costJobId,
          ...costForm,
          quoted_amount: completedJobs.find(j => j.id === costJobId)?.quoted_amount || costForm.quoted_amount || null,
          extra_lines: costLines.filter(l => l.description).map(l => ({ description: l.description, amount: parseFloat(l.amount||'0') })),
        }),
      })
      if (!res.ok) throw new Error()
      setCostModal(false)
      toast.success('Job costing saved')
    } catch { toast.error('Failed') }
    finally { setLoading(false) }
  }

  /* ─── Render ──────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Billed',      value: PKR(stats.totalBilled),     color: 'var(--color-accent)',   icon: FileText },
          { label: 'Collected',         value: PKR(stats.totalReceived),   color: 'var(--color-success)',  icon: CheckCircle2 },
          { label: 'Outstanding',       value: PKR(stats.totalBilled - stats.totalReceived), color: 'var(--color-warning)', icon: DollarSign },
          { label: 'Overdue Balance',   value: PKR(stats.totalOverdue),    color: stats.totalOverdue > 0 ? 'var(--color-danger)' : 'var(--color-success)', icon: AlertTriangle },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}>
              <s.icon size={18} style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">{s.label}</p>
              <p className="text-base font-bold text-[var(--color-text-primary)]">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 flex-wrap">
          {(['','draft','sent','partial','paid','overdue'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn('px-3 h-7 rounded-md text-xs font-medium border transition-all',
                filterStatus === s ? 'bg-[var(--color-accent)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>
              {s === '' ? 'All' : STATUS_CFG[s as keyof typeof STATUS_CFG]?.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAgingModal(true)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
            <AlertTriangle size={14} /> Aging Report
          </button>
          <button onClick={() => setCostModal(true)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
            <Calculator size={14} /> Job Costing
          </button>
          <button onClick={() => setInvModal(true)}
            className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
            <Plus size={15} /> New Invoice
          </button>
        </div>
      </div>

      {/* Invoice list */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        {filteredInvoices.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">No invoices yet</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              <div className="col-span-1" />
              <div className="col-span-2">Invoice #</div>
              <div className="col-span-3">Customer</div>
              <div className="col-span-1">Date</div>
              <div className="col-span-1">Due</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {filteredInvoices.map((inv, idx) => {
                const stCfg = STATUS_CFG[inv.status as keyof typeof STATUS_CFG] || STATUS_CFG.draft
                const isOpen = expanded.has(inv.id)
                const isOverdue = inv.due_date && new Date(inv.due_date) < new Date() && inv.balance_due > 0 && !['paid','cancelled','void'].includes(inv.status)
                const paidPct  = inv.total_amount > 0 ? (inv.paid_amount / inv.total_amount) * 100 : 0

                return (
                  <div key={inv.id}>
                    <div className={cn('grid grid-cols-12 gap-3 px-5 py-3.5 items-center', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15', isOverdue && 'border-l-2 border-l-[var(--color-danger)]')}>
                      <div className="col-span-1">
                        <button onClick={() => toggle(inv.id)} className="text-[var(--color-text-muted)]">
                          {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </button>
                      </div>
                      <div className="col-span-2">
                        <Link href={`/print/finance/${inv.id}`} target="_blank"
                          className="text-sm font-bold font-mono text-[var(--color-accent)] hover:underline">
                          {inv.invoice_number}
                        </Link>
                        <span className={cn('ml-2 text-xs px-2 py-0.5 rounded-full border font-medium', stCfg.color)}>{stCfg.label}</span>
                      </div>
                      <div className="col-span-3">
                        <p className="text-sm text-[var(--color-text-primary)]">{inv.customers?.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{inv.customers?.customer_code}</p>
                      </div>
                      <div className="col-span-1 text-xs text-[var(--color-text-muted)]">{formatDate(inv.invoice_date, { day:'numeric', month:'short' })}</div>
                      <div className="col-span-1 text-xs text-[var(--color-text-muted)]">
                        {inv.due_date ? <span className={cn(isOverdue && 'text-[var(--color-danger)] font-semibold')}>{formatDate(inv.due_date, { day:'numeric', month:'short' })}</span> : '—'}
                      </div>
                      <div className="col-span-2 text-right">
                        <p className="text-sm font-bold text-[var(--color-text-primary)]">{PKR(inv.total_amount)}</p>
                        {inv.balance_due > 0 && inv.status !== 'draft' && (
                          <p className="text-xs text-[var(--color-danger)]">Bal: {PKR(inv.balance_due)}</p>
                        )}
                        {/* Progress bar */}
                        {paidPct > 0 && paidPct < 100 && (
                          <div className="h-1 bg-[var(--color-bg-elevated)] rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-[var(--color-success)] rounded-full" style={{ width: `${paidPct}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="col-span-2 flex items-center gap-1 justify-end">
                        {inv.status === 'draft' && (
                          <button onClick={() => sendInvoice(inv)}
                            className="flex items-center gap-1 px-2.5 h-7 rounded border border-[var(--color-accent)]/30 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors">
                            <Send size={11} /> Send
                          </button>
                        )}
                        {['sent','partial','overdue'].includes(inv.status) && (
                          <button onClick={() => { setPayModal(inv); setPayForm(p => ({ ...p, amount: String(inv.balance_due) })) }}
                            className="flex items-center gap-1 px-2.5 h-7 rounded bg-[var(--color-success)] text-white text-xs font-medium hover:opacity-90 transition-colors">
                            <CreditCard size={11} /> Pay
                          </button>
                        )}
                        <Link href={`/print/finance/${inv.id}`} target="_blank"
                          className="flex items-center gap-1 px-2 h-7 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                          <FileText size={11} />
                        </Link>
                      </div>
                    </div>

                    {/* Expanded */}
                    {isOpen && (
                      <div className="px-10 py-3 bg-[var(--color-bg-elevated)]/30 border-t border-[var(--color-border-subtle)] space-y-2">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          {[
                            { label: 'Subtotal', value: PKR(inv.subtotal) },
                            { label: `Discount (${inv.discount_pct}%)`, value: inv.discount_pct > 0 ? `-${PKR(inv.discount_pct * inv.subtotal / 100)}` : '—' },
                            { label: `Tax (${inv.tax_pct}%)`, value: inv.tax_pct > 0 ? PKR(inv.tax_amount) : '—' },
                            { label: 'Total', value: PKR(inv.total_amount) },
                            { label: 'Paid', value: PKR(inv.paid_amount) },
                            { label: 'Balance Due', value: PKR(inv.balance_due) },
                          ].map(f => (
                            <div key={f.label}>
                              <p className="text-xs text-[var(--color-text-muted)]">{f.label}</p>
                              <p className="text-sm font-medium text-[var(--color-text-primary)]">{f.value}</p>
                            </div>
                          ))}
                        </div>
                        {/* Line items */}
                        {(inv.invoice_items || []).length > 0 && (
                          <div className="mt-2 space-y-1">
                            {(inv.invoice_items || []).map(item => (
                              <div key={item.id} className="flex items-center justify-between text-xs">
                                <span className="text-[var(--color-text-secondary)]">{item.description}</span>
                                <span className="text-[var(--color-text-muted)]">{item.quantity} × {PKR(item.unit_price)} = {PKR(item.subtotal)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Payments */}
                        {(inv.payments || []).length > 0 && (
                          <div className="mt-2 pt-2 border-t border-[var(--color-border-subtle)]">
                            <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Payments</p>
                            {(inv.payments || []).map(pay => (
                              <div key={pay.id} className="flex items-center justify-between text-xs">
                                <span className="text-[var(--color-success)]">✓ {formatDate(pay.payment_date)} · {pay.payment_method.replace('_',' ')}</span>
                                <span className="font-semibold text-[var(--color-success)]">{PKR(pay.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ══ NEW INVOICE MODAL ═══════════════════════════════════════════════════ */}
      <Modal open={invModal} onClose={() => setInvModal(false)} title="New Invoice" size="xl"
        footer={
          <>
            <button onClick={() => setInvModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createInvoice} disabled={loading || !invForm.customer_id}
              className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              <FileText size={14} /> {loading ? 'Creating…' : 'Create Invoice'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Customer <span className="text-[var(--color-danger)]">*</span></label>
              <select className={inputCls} value={invForm.customer_id} onChange={e => setInvForm(p => ({ ...p, customer_id: e.target.value }))}>
                <option value="">Select…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customer_code})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Invoice Date</label>
              <input type="date" className={inputCls} value={invForm.invoice_date} onChange={e => setInvForm(p => ({ ...p, invoice_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Payment Terms (days)</label>
              <input type="number" className={inputCls} value={invForm.payment_terms} onChange={e => setInvForm(p => ({ ...p, payment_terms: e.target.value }))} />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Line Items</p>
              <button onClick={addInvLine} className="text-xs text-[var(--color-accent)] hover:underline flex items-center gap-1"><Plus size={12} /> Add Line</button>
            </div>
            <div className="grid grid-cols-12 gap-2 px-1 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
              <div className="col-span-5">Description</div>
              <div className="col-span-2">Link Job</div>
              <div className="col-span-1">Qty</div>
              <div className="col-span-2">Unit Price</div>
              <div className="col-span-2 text-right">Subtotal</div>
            </div>
            <div className="space-y-1.5">
              {invLines.map((line, idx) => {
                const sub = parseFloat(line.quantity||'0') * parseFloat(line.unit_price||'0')
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5"><input className={inputCls} value={line.description} onChange={e => setInvLine(idx,'description',e.target.value)} placeholder="Description *" /></div>
                    <div className="col-span-2">
                      <select className={inputCls} value={line.job_id} onChange={e => {
                        const job = completedJobs.find(j => j.id === e.target.value)
                        setInvLine(idx,'job_id',e.target.value)
                        if (job && !line.description) setInvLine(idx,'description',job.job_title)
                        if (job?.quoted_amount) setInvLine(idx,'unit_price',String(job.quoted_amount))
                      }}>
                        <option value="">No job</option>
                        {completedJobs.map(j => <option key={j.id} value={j.id}>{j.job_number}</option>)}
                      </select>
                    </div>
                    <div className="col-span-1"><input type="number" className={inputCls} value={line.quantity} onChange={e => setInvLine(idx,'quantity',e.target.value)} /></div>
                    <div className="col-span-2"><input type="number" className={inputCls} value={line.unit_price} onChange={e => setInvLine(idx,'unit_price',e.target.value)} /></div>
                    <div className="col-span-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">{sub > 0 ? PKR(sub) : '—'}</span>
                      {invLines.length > 1 && <button onClick={() => removeInvLine(idx)} className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"><Trash2 size={13} /></button>}
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Totals */}
            <div className="flex justify-end mt-3 pt-3 border-t border-[var(--color-border)]">
              <div className="w-72 space-y-1.5 text-sm">
                <div className="flex justify-between text-[var(--color-text-secondary)]"><span>Subtotal</span><span>{PKR(invSubtotal)}</span></div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[var(--color-text-secondary)] flex-shrink-0">Discount %</span>
                  <input type="number" className="w-20 h-8 px-2 rounded border text-sm text-right bg-[var(--color-bg-elevated)] border-[var(--color-border)] focus:outline-none" value={invForm.discount_pct} onChange={e => setInvForm(p => ({ ...p, discount_pct: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[var(--color-text-secondary)] flex-shrink-0">Tax</span>
                  <div className="flex items-center gap-1.5">
                    <select
                      className="h-8 px-2 rounded border text-xs bg-[var(--color-bg-elevated)] border-[var(--color-border)] focus:outline-none max-w-[110px]"
                      value={invForm.tax_id}
                      onChange={e => {
                        const t = taxes.find(x => x.id === e.target.value)
                        setInvForm(p => ({ ...p, tax_id: e.target.value, tax_pct: t ? String(t.rate_percent) : p.tax_pct }))
                      }}>
                      <option value="">Custom %</option>
                      {taxes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.rate_percent}%)</option>)}
                    </select>
                    <input type="number" className="w-16 h-8 px-2 rounded border text-sm text-right bg-[var(--color-bg-elevated)] border-[var(--color-border)] focus:outline-none"
                      value={invForm.tax_pct}
                      onChange={e => setInvForm(p => ({ ...p, tax_pct: e.target.value, tax_id: '' }))} />
                  </div>
                </div>
                <div className="flex justify-between font-bold text-[var(--color-text-primary)] border-t border-[var(--color-border)] pt-1.5"><span>Total</span><span>{PKR(invTotal)}</span></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
              <input className={inputCls} value={invForm.notes} onChange={e => setInvForm(p => ({ ...p, notes: e.target.value }))} placeholder="Invoice notes…" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Payment Terms Text</label>
              <input className={inputCls} value={invForm.terms} onChange={e => setInvForm(p => ({ ...p, terms: e.target.value }))} />
            </div>
          </div>
        </div>
      </Modal>

      {/* ══ PAYMENT MODAL — Phase 48 ════════════════════════════════════════════ */}
      {payModal && (
        <Modal open={true} onClose={() => setPayModal(null)} title={`Record Payment — ${payModal.invoice_number}`} size="md"
          footer={
            <>
              <button onClick={() => setPayModal(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={recordPayment} disabled={loading}
                className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-success)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
                <CreditCard size={14} /> {loading ? 'Saving…' : 'Record Payment'}
              </button>
            </>
          }>
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-3">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">{payModal.customers?.name}</p>
              <div className="flex items-center justify-between mt-1 text-sm">
                <span className="text-[var(--color-text-muted)]">Total: {PKR(payModal.total_amount)}</span>
                <span className="text-[var(--color-warning)] font-semibold">Balance: {PKR(payModal.balance_due)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-text-primary)]">Amount (PKR) <span className="text-[var(--color-danger)]">*</span></label>
                <input type="number" className={inputCls} value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-text-primary)]">Payment Date</label>
                <input type="date" className={inputCls} value={payForm.payment_date} onChange={e => setPayForm(p => ({ ...p, payment_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Payment Method</label>
              <div className="flex gap-2 flex-wrap">
                {PAY_METHODS.map(m => (
                  <button key={m} onClick={() => setPayForm(p => ({ ...p, payment_method: m }))}
                    className={cn('px-3 h-8 rounded border text-xs font-medium capitalize transition-all',
                      payForm.payment_method === m ? 'bg-[var(--color-accent)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]')}>
                    {m.replace('_',' ')}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-text-primary)]">Reference / Cheque No.</label>
                <input className={inputCls} value={payForm.reference} onChange={e => setPayForm(p => ({ ...p, reference: e.target.value }))} placeholder="Ref / TID / Cheque#" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-text-primary)]">Bank Name</label>
                <input className={inputCls} value={payForm.bank_name} onChange={e => setPayForm(p => ({ ...p, bank_name: e.target.value }))} placeholder="HBL / UBL / MCB…" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
              <input className={inputCls} value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional payment notes" />
            </div>
          </div>
        </Modal>
      )}

      {/* ══ JOB COSTING MODAL — Phase 45 + 46 ══════════════════════════════════ */}
      <Modal open={costModal} onClose={() => setCostModal(false)} title="Job Costing Sheet" size="xl"
        footer={
          <>
            <button onClick={() => setCostModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={runAiCostSuggestion} disabled={aiCostLoading || !costJobId}
              className="flex items-center gap-2 px-4 h-9 rounded-md border border-[var(--color-border)] text-sm font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50 transition-colors">
              <Sparkles size={14} /> {aiCostLoading ? 'Checking…' : 'AI Suggest'}
            </button>
            <button onClick={saveCosting} disabled={loading || !costJobId}
              className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              <Calculator size={14} /> {loading ? 'Saving…' : 'Save Costing'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Job <span className="text-[var(--color-danger)]">*</span></label>
            <select className={inputCls} value={costJobId} onChange={e => {
              setCostJobId(e.target.value)
              const job = completedJobs.find(j => j.id === e.target.value)
              if (job?.quoted_amount) setCostForm(p => ({ ...p, quoted_amount: String(job.quoted_amount) }))
            }}>
              <option value="">Select completed job…</option>
              {completedJobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title} ({j.customers?.name})</option>)}
            </select>
          </div>

          {/* Cost breakdown — two column grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'board_cost',      label: 'Board / Paper Cost (PKR)' },
              { key: 'printing_cost',   label: 'Printing Cost (PKR)' },
              { key: 'plate_cost',      label: 'Plate Cost (PKR)' },
              { key: 'ink_cost',        label: 'Ink Cost (PKR)' },
              { key: 'lamination_cost', label: 'Lamination (PKR)' },
              { key: 'foiling_cost',    label: 'Hot Foil (PKR)' },
              { key: 'uv_cost',         label: 'UV Coating (PKR)' },
              { key: 'die_cutting_cost',label: 'Die Cutting (PKR)' },
              { key: 'pasting_cost',    label: 'Pasting / Gluing (PKR)' },
              { key: 'other_finishing', label: 'Other Finishing (PKR)' },
              { key: 'labour_cost',     label: 'Labour Cost (PKR)' },
              { key: 'overhead_pct',    label: 'Overhead %' },
            ].map(f => (
              <div key={f.key} className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-text-primary)]">{f.label}</label>
                <input type="number" className={inputCls} value={(costForm as any)[f.key]}
                  onChange={e => setCostForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder="0" />
              </div>
            ))}
          </div>

          {/* Extra lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Additional Cost Lines</p>
              <button onClick={() => setCostLines(p => [...p, { description: '', amount: '' }])} className="text-xs text-[var(--color-accent)] hover:underline flex items-center gap-1"><Plus size={12} /> Add</button>
            </div>
            {costLines.map((l, i) => (
              <div key={i} className="flex gap-2 mb-1.5">
                <input className={inputCls} value={l.description} onChange={e => setCostLines(p => p.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="Description" />
                <input type="number" className="w-32 h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] transition-colors flex-shrink-0" value={l.amount} onChange={e => setCostLines(p => p.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} placeholder="PKR" />
                <button onClick={() => setCostLines(p => p.filter((_, j) => j !== i))} className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] flex-shrink-0">✕</button>
              </div>
            ))}
          </div>

          {/* Live summary — Phase 46 Actual vs Quoted */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
            <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Cost Summary</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Direct Costs',   value: PKR(costDirectTotal) },
                { label: 'Extra Costs',    value: PKR(costExtraTotal) },
                { label: `Overhead (${costForm.overhead_pct}%)`, value: PKR(costOverhead) },
                { label: 'Total Cost',     value: PKR(costTotal), bold: true },
              ].map(f => (
                <div key={f.label} className="flex justify-between">
                  <span className={f.bold ? 'font-semibold text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}>{f.label}</span>
                  <span className={f.bold ? 'font-bold text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'}>{f.value}</span>
                </div>
              ))}
            </div>
            {costQuoted > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--color-border)] grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Quoted Amount</span>
                  <span className="text-[var(--color-text-secondary)]">{PKR(costQuoted)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Margin</span>
                  <span className={cn('font-bold', costMargin && costMargin > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>
                    {costMargin !== null ? `${PKR(costMargin)} (${costMarginPct?.toFixed(1)}%)` : '—'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {aiCostSuggestion && (
            <div className="rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
                <Sparkles size={14} /> AI Costing Suggestion
              </div>
              <p className="text-sm text-[var(--color-text-secondary)]">{aiCostSuggestion.summary}</p>
              {(aiCostSuggestion.suggested_total_low != null || aiCostSuggestion.suggested_total_high != null) && (
                <p className="text-sm text-[var(--color-text-primary)]">
                  Suggested range: <strong>{aiCostSuggestion.suggested_total_low != null ? PKR(aiCostSuggestion.suggested_total_low) : '—'} – {aiCostSuggestion.suggested_total_high != null ? PKR(aiCostSuggestion.suggested_total_high) : '—'}</strong>
                  <span className="text-xs text-[var(--color-text-muted)]"> (based on {aiCostSuggestion.comparable_count} similar past job{aiCostSuggestion.comparable_count !== 1 ? 's' : ''})</span>
                </p>
              )}
              {aiCostSuggestion.flags.length > 0 && (
                <div className="space-y-1.5">
                  {aiCostSuggestion.flags.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <AlertTriangle size={12} className="text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
                      <span className="text-[var(--color-text-secondary)]"><strong className="text-[var(--color-text-primary)]">{f.field}:</strong> {f.message}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-[var(--color-text-muted)] pt-1 border-t border-[var(--color-border-subtle)]">
                Advisory only — figures above are not applied automatically.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Costing Notes</label>
            <input className={inputCls} value={costForm.costing_notes} onChange={e => setCostForm(p => ({ ...p, costing_notes: e.target.value }))} placeholder="Notes about this costing…" />
          </div>
        </div>
      </Modal>

      <Modal open={agingModal} onClose={() => setAgingModal(false)} title="Aging Report" size="xl">
        <AgingReportView />
      </Modal>
    </div>
  )
}

interface ArAgingRow { customer_id: string; customer_name: string; current_amt: number; days_1_30: number; days_31_60: number; days_61_90: number; days_over_90: number; total_due: number; oldest_invoice_date: string | null }
interface ApSummaryRow { vendor_id: string; vendor_name: string; balance_owed: number }

function AgingReportView() {
  const [side, setSide] = useState<'ar' | 'ap'>('ar')
  const [arRows, setArRows] = useState<ArAgingRow[]>([])
  const [apRows, setApRows] = useState<ApSummaryRow[]>([])
  const [loading, setLoading] = useState(true)

  useState(() => {
    Promise.all([
      fetch('/api/v1/finance/aging-report?side=ar').then(r => r.json()),
      fetch('/api/v1/finance/aging-report?side=ap').then(r => r.json()),
    ]).then(([ar, ap]) => { setArRows(ar.data ?? []); setApRows(ap.data ?? []) })
      .finally(() => setLoading(false))
  })

  if (loading) return <p className="text-sm text-[var(--color-text-muted)] text-center py-10">Loading…</p>

  const arTotals = arRows.reduce((acc, r) => ({
    current: acc.current + r.current_amt, d30: acc.d30 + r.days_1_30, d60: acc.d60 + r.days_31_60,
    d90: acc.d90 + r.days_61_90, over90: acc.over90 + r.days_over_90, total: acc.total + r.total_due,
  }), { current: 0, d30: 0, d60: 0, d90: 0, over90: 0, total: 0 })

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {(['ar', 'ap'] as const).map(s => (
          <button key={s} onClick={() => setSide(s)}
            className={cn('px-4 h-7 rounded-md text-xs font-medium transition-all', side === s ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)]')}>
            {s === 'ar' ? 'Receivables (customers owe us)' : 'Payables (we owe vendors)'}
          </button>
        ))}
      </div>

      {side === 'ar' ? (
        arRows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-10">No outstanding receivables. 🎉</p>
        ) : (
          <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
            <div className="grid grid-cols-7 gap-2 px-3 py-2 bg-[var(--color-bg-elevated)] text-xs font-semibold text-[var(--color-text-muted)] uppercase">
              <div className="col-span-2">Customer</div>
              <div className="text-right">Current</div>
              <div className="text-right">1-30d</div>
              <div className="text-right">31-60d</div>
              <div className="text-right">61-90d</div>
              <div className="text-right">90+d</div>
            </div>
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {arRows.map(r => (
                <div key={r.customer_id} className="grid grid-cols-7 gap-2 px-3 py-2 items-center text-sm">
                  <div className="col-span-2 text-[var(--color-text-primary)] truncate">{r.customer_name}</div>
                  <div className="text-right text-[var(--color-text-secondary)]">{r.current_amt > 0 ? PKR(r.current_amt) : '—'}</div>
                  <div className="text-right text-[var(--color-warning)]">{r.days_1_30 > 0 ? PKR(r.days_1_30) : '—'}</div>
                  <div className="text-right text-[var(--color-warning)]">{r.days_31_60 > 0 ? PKR(r.days_31_60) : '—'}</div>
                  <div className="text-right text-[var(--color-danger)]">{r.days_61_90 > 0 ? PKR(r.days_61_90) : '—'}</div>
                  <div className="text-right text-[var(--color-danger)] font-medium">{r.days_over_90 > 0 ? PKR(r.days_over_90) : '—'}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2 px-3 py-2 bg-[var(--color-bg-elevated)] border-t border-[var(--color-border)] text-sm font-semibold">
              <div className="col-span-2 text-[var(--color-text-primary)]">Total ({PKR(arTotals.total)})</div>
              <div className="text-right">{PKR(arTotals.current)}</div>
              <div className="text-right text-[var(--color-warning)]">{PKR(arTotals.d30)}</div>
              <div className="text-right text-[var(--color-warning)]">{PKR(arTotals.d60)}</div>
              <div className="text-right text-[var(--color-danger)]">{PKR(arTotals.d90)}</div>
              <div className="text-right text-[var(--color-danger)]">{PKR(arTotals.over90)}</div>
            </div>
          </div>
        )
      ) : (
        apRows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-10">No outstanding payables.</p>
        ) : (
          <div className="rounded-lg border border-[var(--color-border)] overflow-hidden divide-y divide-[var(--color-border-subtle)]">
            {apRows.map(r => (
              <div key={r.vendor_id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <span className="text-[var(--color-text-primary)]">{r.vendor_name}</span>
                <span className="font-medium text-[var(--color-danger)]">{PKR(r.balance_owed)}</span>
              </div>
            ))}
          </div>
        )
      )}
      {side === 'ap' && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Payables shown as total balance owed per vendor (from the supplier ledger), not bucketed by bill age —
          per-bill AP aging would need payment-status tracking added to vendor bills first.
        </p>
      )}
    </div>
  )
}
