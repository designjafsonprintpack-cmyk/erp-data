'use client'
import { useEffect, useState } from 'react'
import { Loader2, Briefcase, FileText, Receipt, AlertCircle, Truck } from 'lucide-react'

interface Job { id: string; job_number: string; job_title: string; status: string; quantity: number; required_date: string | null; created_at: string }
interface Quotation { id: string; quotation_number: string; status: string; total_amount: number; valid_until: string | null; created_at: string }
interface Invoice { id: string; invoice_number: string; status: string; total_amount: number; paid_amount: number; balance_due: number; due_date: string | null; invoice_date: string }
interface DispatchItem { job_id: string; quantity_dispatched: number; jobs?: { job_number: string; job_title: string } | null }
interface Dispatch {
  id: string; dispatch_number: string; status: string; dispatch_method: string
  tracking_number: string | null; courier_name: string | null
  scheduled_date: string | null; dispatched_at: string | null; delivered_at: string | null; created_at: string
  dispatch_items?: DispatchItem[]
}
interface PortalData {
  customer: { name: string; customer_code: string }
  jobs: Job[]; quotations: Quotation[]; invoices: Invoice[]; dispatches: Dispatch[]
  current_balance: number
}

const fmtMoney = (n: number) => `PKR ${Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-PK', { dateStyle: 'medium' }) : '—'

const STATUS_COLORS: Record<string, string> = {
  new: '#8a8f9c', in_progress: '#3b82f6', on_hold: '#f59e0b', completed: '#22c55e', dispatched: '#22c55e', cancelled: '#ef4444',
  draft: '#8a8f9c', sent: '#3b82f6', approved: '#22c55e', rejected: '#ef4444', expired: '#f59e0b', converted: '#22c55e',
  partial: '#f59e0b', paid: '#22c55e', overdue: '#ef4444', void: '#8a8f9c',
  pending: '#8a8f9c', ready: '#3b82f6', delivered: '#22c55e', returned: '#ef4444',
}

const METHOD_LABELS: Record<string, string> = {
  own_vehicle: 'Own Vehicle', courier: 'Courier', customer_pickup: 'Customer Pickup', third_party: 'Third Party',
}

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#8a8f9c'
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize" style={{ color, backgroundColor: `${color}1a`, border: `1px solid ${color}33` }}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// Portal is public/token-based (no session, no company_id claim on the request)
// so it can't safely use Supabase Realtime the way the authenticated staff
// notifications feed does — a public Realtime channel would need to leak
// row-level data outside the normal RLS/JWT model to work. Polling the
// existing rate-limited endpoint (30 req/5min) is the safe way to get
// near-real-time updates instead: every 30s a tab is open is well under
// that limit, and paused entirely while the tab isn't visible.
const POLL_INTERVAL_MS = 30_000

export default function CustomerPortalClient({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = (isBackground: boolean) => {
      fetch(`/api/v1/public/portal/${token}`)
        .then(async res => {
          const json = await res.json()
          if (!res.ok) throw new Error(json.error || 'Could not load your portal.')
          if (cancelled) return
          setData(json)
          setLastUpdated(new Date())
          setError(null)
        })
        .catch(e => { if (!cancelled && !isBackground) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }

    load(false)

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load(true)
    }, POLL_INTERVAL_MS)

    const onVisible = () => { if (document.visibilityState === 'visible') load(true) }
    document.addEventListener('visibilitychange', onVisible)

    return () => { cancelled = true; clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0d12] text-[#e6e8ec] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#8a8f9c]" size={28} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0b0d12] text-[#e6e8ec] flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto mb-3 text-[#ef4444]" size={32} />
          <p className="text-[#e6e8ec] font-medium mb-1">Unable to load this portal</p>
          <p className="text-sm text-[#8a8f9c]">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b0d12] text-[#e6e8ec] p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1c1f26] pb-5">
          <div>
            <p className="text-xs text-[#8a8f9c] uppercase tracking-wide mb-1">Customer Portal</p>
            <h1 className="text-xl font-bold text-[#e6e8ec]">{data.customer.name}</h1>
            <p className="text-xs text-[#8a8f9c] font-mono">{data.customer.customer_code}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#8a8f9c] mb-1">Account Balance</p>
            <p className="text-lg font-bold" style={{ color: data.current_balance > 0 ? '#ef4444' : '#22c55e' }}>{fmtMoney(data.current_balance)}</p>
            {lastUpdated && (
              <p className="text-[10px] text-[#8a8f9c] mt-1 flex items-center gap-1 justify-end">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                Updated {lastUpdated.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>

        {/* Jobs */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#e6e8ec] mb-3">
            <Briefcase size={15} className="text-[#8a8f9c]" /> Recent Jobs
          </h2>
          <div className="rounded-xl border border-[#1c1f26] overflow-hidden">
            {data.jobs.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#8a8f9c]">No jobs yet.</div>
            ) : (
              <div className="divide-y divide-[#1c1f26]">
                {data.jobs.map(j => (
                  <div key={j.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-[#e6e8ec]">{j.job_title}</p>
                      <p className="text-xs text-[#8a8f9c] font-mono">{j.job_number} · Qty {j.quantity?.toLocaleString()} {j.required_date ? `· Due ${fmtDate(j.required_date)}` : ''}</p>
                    </div>
                    <StatusPill status={j.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Dispatch / Delivery */}
        {data.dispatches.length > 0 && (
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[#e6e8ec] mb-3">
              <Truck size={15} className="text-[#8a8f9c]" /> Delivery Status
            </h2>
            <div className="rounded-xl border border-[#1c1f26] overflow-hidden">
              <div className="divide-y divide-[#1c1f26]">
                {data.dispatches.map(d => (
                  <div key={d.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-[#e6e8ec] font-mono">{d.dispatch_number}</p>
                        <p className="text-xs text-[#8a8f9c]">
                          {METHOD_LABELS[d.dispatch_method] || d.dispatch_method}
                          {d.courier_name ? ` · ${d.courier_name}` : ''}
                          {d.tracking_number ? ` · ${d.tracking_number}` : ''}
                        </p>
                      </div>
                      <StatusPill status={d.status} />
                    </div>
                    {(d.dispatch_items?.length ?? 0) > 0 && (
                      <p className="text-xs text-[#8a8f9c] mt-1.5">
                        {d.dispatch_items!.map(i => i.jobs?.job_number).filter(Boolean).join(', ')}
                      </p>
                    )}
                    <p className="text-xs text-[#8a8f9c] mt-1">
                      {d.delivered_at ? `Delivered ${fmtDate(d.delivered_at)}` :
                       d.dispatched_at ? `Dispatched ${fmtDate(d.dispatched_at)}` :
                       d.scheduled_date ? `Scheduled ${fmtDate(d.scheduled_date)}` : `Created ${fmtDate(d.created_at)}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Quotations */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#e6e8ec] mb-3">
            <FileText size={15} className="text-[#8a8f9c]" /> Quotations
          </h2>
          <div className="rounded-xl border border-[#1c1f26] overflow-hidden">
            {data.quotations.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#8a8f9c]">No quotations yet.</div>
            ) : (
              <div className="divide-y divide-[#1c1f26]">
                {data.quotations.map(q => (
                  <div key={q.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-[#e6e8ec] font-mono">{q.quotation_number}</p>
                      <p className="text-xs text-[#8a8f9c]">{fmtMoney(q.total_amount)}{q.valid_until ? ` · Valid until ${fmtDate(q.valid_until)}` : ''}</p>
                    </div>
                    <StatusPill status={q.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Invoices */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#e6e8ec] mb-3">
            <Receipt size={15} className="text-[#8a8f9c]" /> Invoices
          </h2>
          <div className="rounded-xl border border-[#1c1f26] overflow-hidden">
            {data.invoices.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#8a8f9c]">No invoices yet.</div>
            ) : (
              <div className="divide-y divide-[#1c1f26]">
                {data.invoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-[#e6e8ec] font-mono">{inv.invoice_number}</p>
                      <p className="text-xs text-[#8a8f9c]">
                        {fmtMoney(inv.total_amount)} {inv.balance_due > 0 && `· ${fmtMoney(inv.balance_due)} due`}
                        {inv.due_date ? ` · Due ${fmtDate(inv.due_date)}` : ''}
                      </p>
                    </div>
                    <StatusPill status={inv.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <p className="text-center text-xs text-[#8a8f9c] pt-4">Jafson Print Pack · This is a read-only summary of your account</p>
      </div>
    </div>
  )
}
