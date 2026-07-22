import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { notFound } from 'next/navigation'
import { formatDate } from '@/lib/utils/format'

export default async function PrintInvoice({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase.from('invoices' as any)
    .select('*, customers(*), invoice_items(*, jobs(job_number)), payments(*)')
    .eq('id', params.id).maybeSingle()

  if (!data) notFound()
  const inv = data as any
  const items    = inv.invoice_items || []
  const payments = inv.payments || []

  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : null
  const { data: companyRow } = companyId
    ? await supabase.from('companies' as any).select('name, address').eq('id', companyId).maybeSingle()
    : { data: null }
  const companyName = (companyRow as any)?.name || 'Jafson Print Pack'
  const companyAddress = (companyRow as any)?.address || ''

  const PKR = (n: number) => `PKR ${n.toLocaleString('en-PK', { minimumFractionDigits: 2 })}`

  return (
    <html>
      <head>
        <title>Invoice — {inv.invoice_number}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; color: #1f2328; background: white; }
          .page { width: 210mm; min-height: 297mm; padding: 14mm 16mm; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
          .logo { font-size: 22px; font-weight: 800; color: #0969da; }
          .logo-sub { font-size: 10px; color: #57606a; margin-top: 2px; }
          .doc-type { font-size: 24px; font-weight: 800; color: #1f2328; text-align: right; }
          .doc-number { font-size: 18px; font-weight: 700; font-family: monospace; color: #0969da; text-align: right; }
          .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 9px; font-weight: 700; border: 1px solid; margin-top: 4px; }
          .badge-draft    { background:#f6f8fa;color:#57606a;border-color:#d0d7de; }
          .badge-sent     { background:#ddf4ff;color:#0550ae;border-color:#80ccff; }
          .badge-partial  { background:#fff8c5;color:#7d4e00;border-color:#e3b341; }
          .badge-paid     { background:#dafbe1;color:#116329;border-color:#56d364; }
          .badge-overdue  { background:#ffebe9;color:#82071e;border-color:#ff8182; }
          .divider { border-top: 2px solid #0969da; margin: 10px 0 14px; }
          .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
          .info-box h3 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #57606a; margin-bottom: 5px; }
          .info-row { margin-bottom: 2px; font-size: 10px; }
          .info-label { color: #57606a; }
          .info-val { font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th { background: #f6f8fa; padding: 6px 8px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #57606a; border-bottom: 2px solid #0969da; }
          td { padding: 7px 8px; border-bottom: 1px solid #d0d7de; font-size: 10px; }
          tr:last-child td { border-bottom: 0; }
          .totals-table { width: 50%; margin-left: auto; border: 1px solid #d0d7de; border-radius: 6px; overflow: hidden; }
          .totals-table td { padding: 5px 10px; border-bottom: 1px solid #eaecef; }
          .totals-table tr:last-child td { background: #eaf5ff; font-weight: 700; font-size: 12px; }
          .payments-box { border: 1px solid #d0d7de; border-radius: 6px; padding: 8px 10px; margin-top: 10px; }
          .payments-box h3 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #57606a; margin-bottom: 6px; }
          .pay-row { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 3px; }
          .balance-box { margin-top: 8px; padding-top: 6px; border-top: 1px solid #d0d7de; display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; }
          .balance-due { color: ${inv.balance_due > 0 ? '#cf222e' : '#1a7f37'}; }
          .footer { position: absolute; bottom: 14mm; left: 16mm; right: 16mm; border-top: 1px solid #d0d7de; padding-top: 8px; display: flex; justify-content: space-between; font-size: 9px; color: #57606a; }
          .terms-box { font-size: 9px; color: #57606a; margin-top: 14px; border-top: 1px solid #d0d7de; padding-top: 8px; }
          @media print { .page { position: relative; } @page { size: A4; margin: 0; } }
        `}</style>
      </head>
      <body>
        <div className="page" style={{ position: 'relative' }}>
          {/* Header */}
          <div className="header">
            <div>
              <div className="logo">{companyName}</div>
              <div className="logo-sub">{companyAddress}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="doc-type">INVOICE</div>
              <div className="doc-number">{inv.invoice_number}</div>
              <span className={`badge badge-${inv.status}`}>{inv.status?.toUpperCase()}</span>
            </div>
          </div>
          <div className="divider" />

          {/* Bill To + Dates */}
          <div className="two-col">
            <div className="info-box">
              <h3>Bill To</h3>
              <div className="info-row"><span className="info-val" style={{ fontSize:12, fontWeight:700 }}>{inv.customers?.name}</span></div>
              <div className="info-row info-label">Code: <span className="info-val">{inv.customers?.customer_code}</span></div>
              {inv.customers?.address && <div className="info-row info-label">{inv.customers.address}</div>}
              {inv.customers?.phone && <div className="info-row info-label">Ph: <span className="info-val">{inv.customers.phone}</span></div>}
              {inv.customers?.email && <div className="info-row info-label">{inv.customers.email}</div>}
              {inv.customers?.ntn && <div className="info-row info-label">NTN: <span className="info-val">{inv.customers.ntn}</span></div>}
            </div>
            <div className="info-box" style={{ textAlign: 'right' }}>
              <h3>Invoice Details</h3>
              <div className="info-row"><span className="info-label">Invoice No. </span><span className="info-val" style={{ fontFamily: 'monospace' }}>{inv.invoice_number}</span></div>
              <div className="info-row"><span className="info-label">Invoice Date </span><span className="info-val">{formatDate(inv.invoice_date)}</span></div>
              <div className="info-row"><span className="info-label">Due Date </span><span className="info-val" style={{ fontWeight: 700, color: inv.balance_due > 0 ? '#cf222e' : '#1f2328' }}>{inv.due_date ? formatDate(inv.due_date) : '—'}</span></div>
              <div className="info-row"><span className="info-label">Payment Terms </span><span className="info-val">{inv.payment_terms} days</span></div>
            </div>
          </div>

          {/* Items */}
          <table>
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th>Description</th>
                <th style={{ width: 50 }}>Job</th>
                <th style={{ width: 50, textAlign: 'right' }}>Qty</th>
                <th style={{ width: 90, textAlign: 'right' }}>Unit Price</th>
                <th style={{ width: 90, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, idx: number) => (
                <tr key={item.id}>
                  <td>{idx + 1}</td>
                  <td>{item.description}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 9 }}>{item.jobs?.job_number || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{PKR(item.unit_price)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{PKR(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <table className="totals-table">
            <tbody>
              <tr><td>Subtotal</td><td style={{ textAlign:'right' }}>{PKR(inv.subtotal)}</td></tr>
              {inv.discount_pct > 0 && <tr><td>Discount ({inv.discount_pct}%)</td><td style={{ textAlign:'right', color:'#cf222e' }}>-{PKR(inv.discount_amount)}</td></tr>}
              {inv.tax_pct > 0 && <tr><td>Tax / GST ({inv.tax_pct}%)</td><td style={{ textAlign:'right' }}>{PKR(inv.tax_amount)}</td></tr>}
              <tr><td>Total Amount</td><td style={{ textAlign:'right' }}>{PKR(inv.total_amount)}</td></tr>
            </tbody>
          </table>

          {/* Payments */}
          {payments.length > 0 && (
            <div className="payments-box">
              <h3>Payments Received</h3>
              {payments.map((p: any) => (
                <div key={p.id} className="pay-row">
                  <span>{formatDate(p.payment_date)} · {p.payment_method?.replace('_',' ')} {p.reference ? `· ${p.reference}` : ''}</span>
                  <span style={{ color:'#1a7f37', fontWeight:600 }}>{PKR(p.amount)}</span>
                </div>
              ))}
              <div className="balance-box">
                <span>Balance Due</span>
                <span className="balance-due">{PKR(inv.balance_due)}</span>
              </div>
            </div>
          )}

          {/* Terms */}
          {inv.terms && <div className="terms-box"><strong>Terms:</strong> {inv.terms}</div>}
          {inv.notes && <div className="terms-box"><strong>Notes:</strong> {inv.notes}</div>}

          <div className="footer">
            <span>{companyName}{companyAddress ? ` · ${companyAddress}` : ''}</span>
            <span>{inv.invoice_number}</span>
            <span>Printed: {new Date().toLocaleString('en-PK')}</span>
          </div>
        </div>
      </body>
    </html>
  )
}
