import { createSupabaseServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { formatDate } from '@/lib/utils/format'

export default async function PrintSalesOrder({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('sales_orders' as any)
    .select('*, customers(name,customer_code,address,phone,mobile,email,ntn), sales_order_items(*)')
    .eq('id', params.id)
    .maybeSingle()

  if (!data) notFound()
  const so = data as any
  const items = [...(so.sales_order_items || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
  const cust = so.customers || {}

  const subtotal = items.reduce((s: number, i: any) => s + (i.subtotal || 0), 0)
  const discount = so.discount_pct > 0 ? subtotal * so.discount_pct / 100 : 0
  const total = subtotal - discount

  return (
    <html>
      <head>
        <title>Sales Order — {so.so_number}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
          .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 12mm 14mm; }

          /* Header */
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 3px solid #1a56db; }
          .company-name { font-size: 22px; font-weight: 800; color: #1a56db; letter-spacing: -0.5px; }
          .company-sub { font-size: 9px; color: #666; margin-top: 2px; }
          .doc-label { text-align: right; }
          .doc-title { font-size: 20px; font-weight: 800; color: #1a1a1a; letter-spacing: 1px; text-transform: uppercase; }
          .doc-number { font-size: 16px; font-weight: 700; color: #1a56db; font-family: monospace; margin-top: 2px; }

          /* Status Badge */
          .badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; margin-top: 4px; }
          .badge-draft     { background: #f3f4f6; color: #6b7280; border: 1px solid #d1d5db; }
          .badge-confirmed { background: #ecfdf5; color: #065f46; border: 1px solid #6ee7b7; }
          .badge-cancelled { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }

          /* Info Grid */
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
          .info-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; }
          .info-box-title { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #6b7280; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #f3f4f6; }
          .info-row { display: flex; gap: 6px; margin-bottom: 3px; }
          .info-label { font-size: 9px; color: #9ca3af; width: 80px; flex-shrink: 0; }
          .info-value { font-size: 10px; font-weight: 500; color: #1a1a1a; }
          .info-value-lg { font-size: 12px; font-weight: 700; color: #1a1a1a; }

          /* Table */
          table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
          thead tr { background: #1a56db; }
          thead th { padding: 7px 8px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: white; }
          thead th:last-child, thead th:nth-last-child(2) { text-align: right; }
          tbody td { padding: 7px 8px; border-bottom: 1px solid #f3f4f6; font-size: 10px; vertical-align: middle; }
          tbody td:last-child, tbody td:nth-last-child(2) { text-align: right; }
          tbody tr:nth-child(even) td { background: #f9fafb; }
          tbody tr:last-child td { border-bottom: 2px solid #e5e7eb; }

          /* Totals */
          .totals-section { display: flex; justify-content: flex-end; margin-top: 8px; }
          .totals-box { width: 220px; }
          .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; }
          .totals-row.divider { border-top: 1px solid #e5e7eb; margin-top: 2px; padding-top: 6px; }
          .totals-row.total { font-size: 13px; font-weight: 800; color: #1a56db; border-top: 2px solid #1a56db; padding-top: 6px; margin-top: 4px; }

          /* Notes */
          .notes-section { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .notes-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; min-height: 50px; }
          .notes-title { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #6b7280; margin-bottom: 4px; }
          .notes-text { font-size: 10px; color: #374151; line-height: 1.5; }

          /* Signatures */
          .sig-section { margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
          .sig-box { text-align: center; }
          .sig-line { border-bottom: 1px solid #1a1a1a; height: 36px; margin-bottom: 4px; }
          .sig-label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
          .sig-sub { font-size: 8px; color: #9ca3af; margin-top: 1px; }

          /* Footer */
          .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 8px; color: #9ca3af; }

          /* Urgency bar */
          .urgency-bar { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 4px; padding: 5px 10px; margin-bottom: 10px; font-size: 9px; font-weight: 600; color: #92400e; display: flex; align-items: center; gap: 6px; }

          @media print {
            .page { margin: 0; padding: 10mm 12mm; }
            @page { size: A4; margin: 0; }
          }
        `}</style>
      </head>
      <body>
        <div className="page">

          {/* Header */}
          <div className="header">
            <div>
              <div className="company-name">Jafson Print Pack</div>
              <div className="company-sub">Quaid-e-Azam Street, Dhama, Lalamusa, Distt. Gujrat — Pakistan</div>
              <div className="company-sub">Tel: +92 53 7510029 | NTN: —</div>
            </div>
            <div className="doc-label">
              <div className="doc-title">Sales Order</div>
              <div className="doc-number">{so.so_number}</div>
              <span className={`badge badge-${so.status}`}>{so.status?.toUpperCase()}</span>
            </div>
          </div>

          {/* Urgency warning */}
          {so.required_date && new Date(so.required_date) < new Date(Date.now() + 3 * 86400000) && so.status !== 'cancelled' && (
            <div className="urgency-bar">
              ⚠ Required Date: {formatDate(so.required_date)} — URGENT
            </div>
          )}

          {/* Info Grid */}
          <div className="info-grid">
            <div className="info-box">
              <div className="info-box-title">Bill To</div>
              <div className="info-value-lg" style={{ marginBottom: 4 }}>{cust.name}</div>
              <div className="info-row"><span className="info-label">Code</span><span className="info-value">{cust.customer_code}</span></div>
              {cust.address && <div className="info-row"><span className="info-label">Address</span><span className="info-value">{cust.address}</span></div>}
              {cust.phone && <div className="info-row"><span className="info-label">Phone</span><span className="info-value">{cust.phone}</span></div>}
              {cust.mobile && <div className="info-row"><span className="info-label">Mobile</span><span className="info-value">{cust.mobile}</span></div>}
              {cust.email && <div className="info-row"><span className="info-label">Email</span><span className="info-value">{cust.email}</span></div>}
              {cust.ntn && <div className="info-row"><span className="info-label">NTN</span><span className="info-value">{cust.ntn}</span></div>}
            </div>
            <div className="info-box">
              <div className="info-box-title">Order Details</div>
              <div className="info-row"><span className="info-label">SO Number</span><span className="info-value" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{so.so_number}</span></div>
              <div className="info-row"><span className="info-label">Order Date</span><span className="info-value">{formatDate(so.order_date || so.created_at)}</span></div>
              <div className="info-row">
                <span className="info-label">Required By</span>
                <span className="info-value" style={{ fontWeight: 700, color: so.required_date && new Date(so.required_date) < new Date(Date.now() + 3*86400000) ? '#dc2626' : '#1a1a1a' }}>
                  {so.required_date ? formatDate(so.required_date) : '—'}
                </span>
              </div>
              <div className="info-row"><span className="info-label">Status</span><span className="info-value" style={{ fontWeight: 700, textTransform: 'capitalize' }}>{so.status}</span></div>
              {so.urgency && <div className="info-row"><span className="info-label">Priority</span><span className="info-value" style={{ color: '#dc2626', fontWeight: 700 }}>{so.urgency?.toUpperCase()}</span></div>}
            </div>
          </div>

          {/* Line Items Table */}
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th>Description</th>
                <th style={{ width: 90 }}>Size (mm)</th>
                <th style={{ width: 60, textAlign: 'right' }}>Qty</th>
                <th style={{ width: 45, textAlign: 'right' }}>Colors</th>
                <th style={{ width: 90, textAlign: 'right' }}>Unit Price</th>
                <th style={{ width: 100, textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, idx: number) => {
                const size = [item.size_l, item.size_w, item.size_h].filter(Boolean).join(' × ')
                return (
                  <tr key={item.id}>
                    <td style={{ color: '#9ca3af' }}>{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.product_desc}</div>
                      {item.notes && <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>{item.notes}</div>}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{size || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{item.quantity?.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{item.no_of_colors || '—'}</td>
                    <td style={{ textAlign: 'right' }}>PKR {(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>PKR {(item.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div className="totals-section">
            <div className="totals-box">
              <div className="totals-row">
                <span style={{ color: '#6b7280' }}>Subtotal</span>
                <span>PKR {subtotal.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
              </div>
              {so.discount_pct > 0 && (
                <div className="totals-row">
                  <span style={{ color: '#6b7280' }}>Discount ({so.discount_pct}%)</span>
                  <span style={{ color: '#dc2626' }}>− PKR {discount.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                </div>
              )}
              <div className="totals-row total">
                <span>TOTAL</span>
                <span>PKR {total.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
              </div>
              <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 4, textAlign: 'right' }}>Amount in Pakistan Rupees</div>
            </div>
          </div>

          {/* Notes & Terms */}
          {(so.notes || so.terms) && (
            <div className="notes-section">
              {so.notes && (
                <div className="notes-box">
                  <div className="notes-title">Notes</div>
                  <div className="notes-text">{so.notes}</div>
                </div>
              )}
              {so.terms && (
                <div className="notes-box">
                  <div className="notes-title">Terms & Conditions</div>
                  <div className="notes-text">{so.terms}</div>
                </div>
              )}
            </div>
          )}

          {/* Signatures */}
          <div className="sig-section">
            {[
              { label: 'Prepared By', sub: 'Jafson Print Pack' },
              { label: 'Authorized By', sub: 'Management' },
              { label: 'Customer Acceptance', sub: cust.name },
            ].map(s => (
              <div key={s.label} className="sig-box">
                <div className="sig-line" />
                <div className="sig-label">{s.label}</div>
                <div className="sig-sub">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="footer">
            <span>Jafson Print Pack · Lalamusa, Gujrat, Pakistan</span>
            <span>{so.so_number} · Printed: {new Date().toLocaleString('en-PK')}</span>
            <span>Jafson Print ERP</span>
          </div>

        </div>

        {/* Auto print */}
        <script dangerouslySetInnerHTML={{ __html: `window.onload = function() { window.print(); }` }} />
      </body>
    </html>
  )
}
