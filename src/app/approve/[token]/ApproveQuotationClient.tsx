'use client'
import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, FileText, Loader2 } from 'lucide-react'

interface QItem {
  product_desc: string; size_l: number | null; size_w: number | null; size_h: number | null
  quantity: number; no_of_colors: number | null; unit_price: number; subtotal: number
}
interface Quotation {
  id: string; quotation_number: string; status: string; valid_until: string | null
  notes: string | null; terms_conditions: string | null
  subtotal: number; tax_amount: number; discount_amount: number; total_amount: number
  approval_responded_at: string | null
  customers: { name: string } | null
  quotation_items: QItem[]
  company_name?: string
}

const fmtMoney = (n: number) => `PKR ${Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-PK', { dateStyle: 'medium' }) : '—'

export default function ApproveQuotationClient({ token }: { token: string }) {
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<'approve' | 'reject' | null>(null)
  const [result, setResult] = useState<'approved' | 'rejected' | null>(null)

  useEffect(() => {
    fetch(`/api/v1/public/quotations/${token}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Could not load this quotation.')
        setQuotation(json.data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const respond = async (action: 'approve' | 'reject') => {
    setSubmitting(action)
    try {
      const res = await fetch(`/api/v1/public/quotations/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Something went wrong.')
      setResult(action === 'approve' ? 'approved' : 'rejected')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0d12] text-[#e6e8ec] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2 mb-6 justify-center text-[#8a8f9c]">
          <FileText size={18} />
          <span className="text-sm font-medium tracking-wide uppercase">{quotation?.company_name || 'Jafson Print Pack'} — Quotation Approval</span>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-[#8a8f9c] py-16">
            <Loader2 size={18} className="animate-spin" /> Loading…
          </div>
        )}

        {!loading && error && !result && (
          <div className="rounded-xl border border-[#3a2020] bg-[#1a1414] p-8 text-center">
            <XCircle size={32} className="mx-auto mb-3 text-[#e5484d]" />
            <p className="text-[#e6e8ec] font-medium">{error}</p>
          </div>
        )}

        {!loading && !error && result && (
          <div className={`rounded-xl border p-8 text-center ${result === 'approved' ? 'border-[#1f3a2a] bg-[#101a14]' : 'border-[#3a2020] bg-[#1a1414]'}`}>
            {result === 'approved'
              ? <CheckCircle2 size={36} className="mx-auto mb-3 text-[#3fb865]" />
              : <XCircle size={36} className="mx-auto mb-3 text-[#e5484d]" />}
            <p className="text-lg font-semibold text-[#e6e8ec]">
              {result === 'approved' ? 'Quotation Approved' : 'Quotation Rejected'}
            </p>
            <p className="text-sm text-[#8a8f9c] mt-1.5">
              {result === 'approved'
                ? "Thank you — we've received your approval and will proceed accordingly."
                : "We've recorded your response. Feel free to reach out if you'd like to discuss changes."}
            </p>
          </div>
        )}

        {!loading && !error && !result && quotation && (
          <div className="rounded-xl border border-[#22252c] bg-[#12141a] overflow-hidden">
            <div className="p-6 border-b border-[#22252c] flex items-start justify-between">
              <div>
                <p className="text-xs text-[#8a8f9c] uppercase tracking-wide">Quotation</p>
                <p className="text-xl font-bold text-[#e6e8ec] font-mono">{quotation.quotation_number}</p>
                {quotation.customers?.name && <p className="text-sm text-[#8a8f9c] mt-1">For {quotation.customers.name}</p>}
              </div>
              {quotation.valid_until && (
                <div className="text-right">
                  <p className="text-xs text-[#8a8f9c] uppercase tracking-wide">Valid Until</p>
                  <p className="text-sm text-[#e6e8ec]">{fmtDate(quotation.valid_until)}</p>
                </div>
              )}
            </div>

            <div className="p-6 space-y-3">
              {quotation.quotation_items.map((item, i) => (
                <div key={i} className="flex items-start justify-between gap-4 py-2 border-b border-[#1c1f26] last:border-0">
                  <div>
                    <p className="text-sm text-[#e6e8ec]">{item.product_desc}</p>
                    <p className="text-xs text-[#6b7080] mt-0.5">
                      {[item.size_l && item.size_w ? `${item.size_l} × ${item.size_w}${item.size_h ? ` × ${item.size_h}` : ''}` : null,
                        item.no_of_colors ? `${item.no_of_colors} colors` : null,
                        `Qty ${item.quantity}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <p className="text-sm text-[#e6e8ec] font-mono whitespace-nowrap">{fmtMoney(item.subtotal)}</p>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-[#22252c] space-y-1.5 bg-[#0e1015]">
              <div className="flex justify-between text-sm text-[#8a8f9c]"><span>Subtotal</span><span className="font-mono">{fmtMoney(quotation.subtotal)}</span></div>
              {quotation.discount_amount > 0 && <div className="flex justify-between text-sm text-[#8a8f9c]"><span>Discount</span><span className="font-mono">-{fmtMoney(quotation.discount_amount)}</span></div>}
              {quotation.tax_amount > 0 && <div className="flex justify-between text-sm text-[#8a8f9c]"><span>Tax</span><span className="font-mono">{fmtMoney(quotation.tax_amount)}</span></div>}
              <div className="flex justify-between text-base font-bold text-[#e6e8ec] pt-1.5 border-t border-[#22252c]"><span>Total</span><span className="font-mono">{fmtMoney(quotation.total_amount)}</span></div>
            </div>

            {quotation.terms_conditions && (
              <div className="px-6 py-4 border-t border-[#22252c] text-xs text-[#6b7080] whitespace-pre-wrap">{quotation.terms_conditions}</div>
            )}

            <div className="p-6 border-t border-[#22252c] flex gap-3">
              <button onClick={() => respond('reject')} disabled={!!submitting}
                className="flex-1 h-11 rounded-lg border border-[#3a2020] text-[#e5484d] font-medium text-sm hover:bg-[#1a1414] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {submitting === 'reject' ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                Reject
              </button>
              <button onClick={() => respond('approve')} disabled={!!submitting}
                className="flex-1 h-11 rounded-lg bg-[#2e7d46] text-white font-medium text-sm hover:bg-[#357d4a] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {submitting === 'approve' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Approve
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
