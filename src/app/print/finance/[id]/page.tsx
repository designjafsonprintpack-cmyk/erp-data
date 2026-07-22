import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { notFound } from 'next/navigation'
import { formatDate } from '@/lib/utils/format'

export default async function PrintInvoice({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('invoices' as any)
    .select('*, customers(name,customer_code,address,phone,mobile,email,ntn), invoice_items(*, jobs(job_number,job_title)), payments(*)')
    .eq('id', params.id)
    .maybeSingle()

  if (!data) notFound()
  const inv = data as any
  const items   = inv.invoice_items || []
  const pmts    = inv.payments || []
  const cust    = inv.customers || {}
  const overdue = inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'paid'

  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : null
  const { data: companyRow } = companyId
    ? await supabase.from('companies' as any).select('name, address, ntn').eq('id', companyId).maybeSingle()
    : { data: null }
  const companyName = (companyRow as any)?.name || 'Jafson Print Pack'
  const companyAddress = (companyRow as any)?.address || ''
  const companyNtn = (companyRow as any)?.ntn || '—'

  return (
    <html>
      <head>
        <title>Invoice {inv.invoice_number}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; color: #1f2328; background: white; }
          .page { width: 210mm; min-height: 297mm; padding: 14mm 16mm; margin: 0 auto; position: relative; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
          .company-name { font-size: 22px; font-weight: 800; color: #0969da; letter-spacing: -0.5px; }
          .company-sub  { font-size: 10px; color: #57606a; margin-top: 2px; }
          .inv-title  { font-size: 28px; font-weight: 800; color: #1f2328; text-align: right; }
          .inv-number { font-size: 14px; font-family: monospace; font-weight: 700; color: #0969da; text-align: right; margin-top: 2px; }
          .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 9px; font-weight: 700; border: 1px solid; margin-top: 4px; float: right; }
          .badge-draft    { background: #f6f8fa; color: #57606a; border-color: #d0d7de; }
          .badge-sent     { background: #ddf4ff; color: #0550ae; border-color: #80ccff; }
          .badge-paid     { background: #dafbe1; color: #116329; border-color: #56d364; }
          .badge-partial  { background: #fff8c5; color: #7d4e00; border-color: #e3b341; }
          .badge-overdue  { background: #ffebe9; color: #82071e; border-color: #ff818266; }
          .divider { border: none; border-top: 2px solid #0969da; margin: 12px 0; }
          .info-row { display: flex; gap: 24px; margin-bottom: 14px; }
          .info-box { flex: 1; }
          .info-box h3 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #57606a; margin-bottom: 6px; padding-bottom: 3px; border-bottom: 1px solid #d0d7de; }
          .info-line { display: flex; gap: 8px; margin-bottom: 2px; }
          .info-label { font-size: 10px; color: #57606a; min-width: 80px; }
          .info-value { font-size: 10px; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
          thead th { background: #0969da; color: white; padding: 7px 8px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
          thead th:last-child { text-align: right; }
          tbody td { padding: 7px 8px; border-bottom: 1px solid #f0f0f0; font-size: 10px; vertical-align: top; }
          tbody td:last-child { text-align: right; font-weight: 600; }
          tbody tr:nth-child(even) td { background: #f9fafb; }
          .totals-table { width: 260px; margin-left: auto; margin-top: 12px; border-collapse: collapse; }
          .totals-table td { padding: 5px 8px; font-size: 11px; }
          .totals-table .total-row { font-weight: 800; font-size: 13px; background: #0969da; color: white; border-radius: 4px; }
          .totals-table .total-row td { padding: 7px 8px; }
          .balance-row td { color: ${inv.balance_due > 0 ? '#cf222e' : '#116329'}; font-weight: 700; }
          .section-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #57606a; margin: 14px 0 6px; }
          .pmt-table { width: 100%; border-collapse: collapse; }
          .pmt-table td, .pmt-table th { padding: 5px 8px; font-size: 10px; border-bottom: 1px solid #f0f0f0; }
          .pmt-table th { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #57606a; }
          .footer { position: absolute; bottom: 14mm; left: 16mm; right: 16mm; }
          .sig-row { display: flex; gap: 20px; margin-top: 24px; }
          .sig-box { flex: 1; text-align: center; }
          .sig-line { border-bottom: 1px solid #1f2328; height: 36px; margin-bottom: 4px; }
          .sig-label { font-size: 9px; color: #57606a; text-transform: uppercase; letter-spacing: 0.05em; }
          .footer-bar { margin-top: 14px; padding-top: 8px; border-top: 1px solid #d0d7de; display: flex; justify-content: space-between; font-size: 9px; color: #57606a; }
          .overdue-banner { background: #ffebe9; border: 1px solid #ff818266; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; font-size: 10px; color: #82071e; font-weight: 600; text-align: center; }
          @media print { .page { margin: 0; } @page { size: A4; margin: 0; } }
        `}</style>
      </head>
      <body>
        <div className="page">
          {/* Header */}
          <div className="header">
            <div>
              <div className="company-name">{companyName}</div>
              <div className="company-sub">{companyAddress}{companyAddress ? ' · ' : ''}NTN: {companyNtn}</div>
            </div>
            <div>
              <div className="inv-title">INVOICE</div>
              <div className="inv-number">{inv.invoice_number}</div>
              <span className={`badge badge-${overdue ? 'overdue' : inv.status}`}>
                {overdue ? 'OVERDUE' : inv.status?.toUpperCase()}
              </span>
            </div>
          </div>
          <hr className="divider" />

          {/* Overdue banner */}
          {overdue && (
            <div className="overdue-banner">
              ⚠ This invoice was due on {formatDate(inv.due_date)} and is OVERDUE. Balance: PKR {inv.balance_due?.toLocaleString()}
            </div>
          )}

          {/* Bill To + Invoice Details */}
          <div className="info-row">
            <div className="info-box">
              <h3>Bill To</h3>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{cust.name}</div>
              {cust.customer_code && <div className="info-line"><span className="info-label">Code</span><span className="info-value">{cust.customer_code}</span></div>}
              {cust.address && <div className="info-line"><span className="info-label">Address</span><span className="info-value">{cust.address}</span></div>}
              {cust.phone && <div className="info-line"><span className="info-label">Phone</span><span className="info-value">{cust.phone}</span></div>}
              {cust.email && <div className="info-line"><span className="info-label">Email</span><span className="info-value">{cust.email}</span></div>}
              {cust.ntn && <div className="info-line"><span className="info-label">NTN</span><span className="info-value">{cust.ntn}</span></div>}
            </div>
            <div className="info-box">
              <h3>Invoice Details</h3>
              <div className="info-line"><span className="info-label">Invoice No.</span><span className="info-value" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{inv.invoice_number}</span></div>
              <div className="info-line"><span className="info-label">Invoice Date</span><span className="info-value">{formatDate(inv.invoice_date)}</span></div>
              <div className="info-line"><span className="info-label">Due Date</span><span className="info-value" style={{ color: overdue ? '#cf222e' : undefined, fontWeight: overdue ? 700 : undefined }}>{inv.due_date ? formatDate(inv.due_date) : 'On receipt'}</span></div>
              <div className="info-line"><span className="info-label">Terms</span><span className="info-value">{inv.payment_terms} days</span></div>
            </div>
          </div>

          {/* Line Items */}
          <table>
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th style={{ width: 80 }}>Job No.</th>
                <th>Description</th>
                <th style={{ width: 55, textAlign: 'right' }}>Qty</th>
                <th style={{ width: 85, textAlign: 'right' }}>Unit Price</th>
                <th style={{ width: 90, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, idx: number) => (
                <tr key={item.id}>
                  <td>{idx + 1}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{item.jobs?.job_number || '—'}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{item.description}</div>
                    {item.jobs?.job_title && item.jobs.job_title !== item.description && (
                      <div style={{ fontSize: 9, color: '#57606a', marginTop: 1 }}>{item.jobs.job_title}</div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>{item.quantity?.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>PKR {item.unit_price?.toLocaleString(undefined, { minimumFractionDigits: 0 })}</td>
                  <td>PKR {item.amount?.toLocaleString(undefined, { minimumFractionDigits: 0 })}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <table className="totals-table">
            <tbody>
              <tr>
                <td style={{ color: '#57606a' }}>Subtotal</td>
                <td style={{ textAlign: 'right' }}>PKR {inv.subtotal?.toLocaleString(undefined, { minimumFractionDigits: 0 })}</td>
              </tr>
              {inv.discount_pct > 0 && (
                <tr>
                  <td style={{ color: '#57606a' }}>Discount ({inv.discount_pct}%)</td>
                  <td style={{ textAlign: 'right', color: '#cf222e' }}>− PKR {(inv.subtotal * inv.discount_pct / 100)?.toLocaleString(undefined, { minimumFractionDigits: 0 })}</td>
                </tr>
              )}
              {inv.tax_pct > 0 && (
                <tr>
                  <td style={{ color: '#57606a' }}>GST / Tax ({inv.tax_pct}%)</td>
                  <td style={{ textAlign: 'right' }}>PKR {inv.tax_amount?.toLocaleString(undefined, { minimumFractionDigits: 0 })}</td>
                </tr>
              )}
              <tr className="total-row">
                <td>TOTAL</td>
                <td style={{ textAlign: 'right' }}>PKR {inv.total_amount?.toLocaleString(undefined, { minimumFractionDigits: 0 })}</td>
              </tr>
              {inv.paid_amount > 0 && (
                <tr>
                  <td style={{ color: '#116329' }}>Paid</td>
                  <td style={{ textAlign: 'right', color: '#116329' }}>PKR {inv.paid_amount?.toLocaleString(undefined, { minimumFractionDigits: 0 })}</td>
                </tr>
              )}
              {inv.balance_due > 0 && (
                <tr className="balance-row">
                  <td>Balance Due</td>
                  <td style={{ textAlign: 'right' }}>PKR {inv.balance_due?.toLocaleString(undefined, { minimumFractionDigits: 0 })}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Payment History */}
          {pmts.length > 0 && (
            <div>
              <div className="section-title">Payment History</div>
              <table className="pmt-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pmts.map((p: any) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.payment_date)}</td>
                      <td className="capitalize">{p.payment_method?.replace('_',' ')}</td>
                      <td>{p.reference || p.bank_name || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#116329' }}>PKR {p.amount?.toLocaleString(undefined, { minimumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Terms & Notes */}
          {(inv.terms || inv.notes) && (
            <div style={{ marginTop: 14, fontSize: 10, color: '#57606a' }}>
              {inv.terms && <div><strong>Terms:</strong> {inv.terms}</div>}
              {inv.notes && <div style={{ marginTop: 4 }}><strong>Notes:</strong> {inv.notes}</div>}
            </div>
          )}

          {/* Signatures & Footer */}
          <div className="footer">
            <div className="sig-row">
              {['Prepared By', 'Authorized Signatory', 'Received By'].map(label => (
                <div key={label} className="sig-box">
                  <div className="sig-line" />
                  <div className="sig-label">{label}</div>
                </div>
              ))}
            </div>
            <div className="footer-bar">
              <span>{companyName}{companyAddress ? ` · ${companyAddress}` : ''}</span>
              <span>{inv.invoice_number} · Generated: {new Date().toLocaleString('en-PK')}</span>
              <span>{companyName}</span>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
