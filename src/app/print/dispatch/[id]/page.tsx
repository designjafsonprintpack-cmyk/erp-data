import { createSupabaseServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { formatDate } from '@/lib/utils/format'

export default async function PrintDispatchChallan({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase.from('dispatch_orders' as any)
    .select('*, customers(name,customer_code,address,phone,mobile,email), dispatch_items(*, jobs(job_number,job_title,quantity,die_number,size_l,size_w,size_h))')
    .eq('id', params.id).maybeSingle()

  if (!data) notFound()
  const d = data as any
  const items = d.dispatch_items || []
  const totalPcs = items.reduce((s: number, i: any) => s + (i.quantity_dispatched || 0), 0)
  const totalCtns = items.reduce((s: number, i: any) => s + (i.carton_count || 0), 0)

  return (
    <html>
      <head>
        <title>Delivery Challan — {d.dispatch_number}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; color: #1f2328; background: white; }
          .page { width: 210mm; min-height: 297mm; padding: 14mm 16mm; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0969da; padding-bottom: 10px; margin-bottom: 14px; }
          .logo { font-size: 20px; font-weight: 800; color: #0969da; }
          .doc-title { font-size: 16px; font-weight: 700; color: #1f2328; text-align: right; }
          .doc-number { font-size: 22px; font-weight: 800; font-family: monospace; color: #0969da; text-align: right; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
          .info-box { border: 1px solid #d0d7de; border-radius: 6px; padding: 8px 10px; }
          .info-box h3 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #57606a; margin-bottom: 5px; }
          .info-row { display: flex; gap: 6px; margin-bottom: 2px; }
          .info-label { font-size: 10px; color: #57606a; width: 90px; flex-shrink: 0; }
          .info-value { font-size: 10px; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th { background: #f6f8fa; padding: 6px 8px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #57606a; border: 1px solid #d0d7de; }
          td { padding: 7px 8px; border: 1px solid #d0d7de; font-size: 10px; vertical-align: top; }
          tr:nth-child(even) td { background: #f6f8fa; }
          .totals-row td { font-weight: 700; background: #eaf5ff !important; }
          .footer { margin-top: 24px; border-top: 1px solid #d0d7de; padding-top: 14px; }
          .sig-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
          .sig-box { text-align: center; }
          .sig-line { border-bottom: 1px solid #1f2328; height: 40px; margin-bottom: 4px; }
          .sig-label { font-size: 9px; color: #57606a; text-transform: uppercase; letter-spacing: 0.05em; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 700; border: 1px solid; }
          .badge-pending   { background: #f6f8fa; color: #57606a; border-color: #d0d7de; }
          .badge-dispatched { background: #fff8c5; color: #7d4e00; border-color: #e3b341; }
          .badge-delivered { background: #dafbe1; color: #116329; border-color: #56d364; }
          @media print { .page { margin: 0; } @page { size: A4; margin: 0; } }
        `}</style>
      </head>
      <body>
        <div className="page">
          {/* Header */}
          <div className="header">
            <div>
              <div className="logo">Jafson Print Pack</div>
              <div style={{ fontSize: 10, color: '#57606a', marginTop: 2 }}>Lahore, Pakistan</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="doc-title">DELIVERY CHALLAN</div>
              <div className="doc-number">{d.dispatch_number}</div>
              <div style={{ marginTop: 4 }}>
                <span className={`badge badge-${d.status}`}>{d.status?.toUpperCase()}</span>
              </div>
            </div>
          </div>

          {/* Info Grid */}
          <div className="info-grid">
            <div className="info-box">
              <h3>Deliver To</h3>
              <div className="info-row"><span className="info-label">Customer</span><span className="info-value" style={{ fontWeight: 700 }}>{d.customers?.name}</span></div>
              <div className="info-row"><span className="info-label">Code</span><span className="info-value">{d.customers?.customer_code}</span></div>
              {d.delivery_contact && <div className="info-row"><span className="info-label">Contact</span><span className="info-value">{d.delivery_contact}</span></div>}
              {d.delivery_phone && <div className="info-row"><span className="info-label">Phone</span><span className="info-value">{d.delivery_phone}</span></div>}
              {d.delivery_address && <div className="info-row"><span className="info-label">Address</span><span className="info-value">{d.delivery_address}{d.delivery_city ? `, ${d.delivery_city}` : ''}</span></div>}
            </div>
            <div className="info-box">
              <h3>Dispatch Details</h3>
              <div className="info-row"><span className="info-label">Challan No.</span><span className="info-value" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{d.dispatch_number}</span></div>
              <div className="info-row"><span className="info-label">Date</span><span className="info-value">{formatDate(d.scheduled_date || d.created_at)}</span></div>
              <div className="info-row"><span className="info-label">Method</span><span className="info-value capitalize">{d.dispatch_method?.replace('_',' ')}</span></div>
              {d.vehicle_number && <div className="info-row"><span className="info-label">Vehicle</span><span className="info-value">{d.vehicle_number}</span></div>}
              {d.driver_name && <div className="info-row"><span className="info-label">Driver</span><span className="info-value">{d.driver_name}</span></div>}
              {d.courier_name && <div className="info-row"><span className="info-label">Courier</span><span className="info-value">{d.courier_name}</span></div>}
              {d.tracking_number && <div className="info-row"><span className="info-label">Tracking</span><span className="info-value">{d.tracking_number}</span></div>}
            </div>
          </div>

          {/* Items Table */}
          <table>
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th style={{ width: 80 }}>Job No.</th>
                <th>Description</th>
                <th style={{ width: 50 }}>Size</th>
                <th style={{ width: 60, textAlign: 'right' }}>Qty</th>
                <th style={{ width: 55, textAlign: 'right' }}>Cartons</th>
                <th style={{ width: 60, textAlign: 'right' }}>Weight</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, idx: number) => (
                <tr key={item.id}>
                  <td>{idx + 1}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.jobs?.job_number}</td>
                  <td>{item.jobs?.job_title}</td>
                  <td style={{ fontSize: 9 }}>
                    {item.jobs?.size_l && item.jobs?.size_w ? `${item.jobs.size_l}×${item.jobs.size_w}${item.jobs.size_h ? `×${item.jobs.size_h}` : ''}` : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{item.quantity_dispatched?.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{item.carton_count || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{item.weight_kg ? `${item.weight_kg} kg` : '—'}</td>
                </tr>
              ))}
              <tr className="totals-row">
                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>TOTAL</td>
                <td style={{ textAlign: 'right' }}>{totalPcs.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{totalCtns || '—'}</td>
                <td />
              </tr>
            </tbody>
          </table>

          {/* Notes */}
          {d.notes && (
            <div style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', marginBottom: 12, fontSize: 10, color: '#57606a' }}>
              <strong>Notes:</strong> {d.notes}
            </div>
          )}

          {/* Delivery Charges */}
          {d.delivery_charges > 0 && (
            <div style={{ textAlign: 'right', marginBottom: 12, fontSize: 11 }}>
              Delivery Charges: <strong>PKR {d.delivery_charges.toLocaleString()}</strong>
            </div>
          )}

          {/* Signatures */}
          <div className="footer">
            <div className="sig-grid">
              {[['Prepared By', 'Jafson Print Pack'], ['Received By', `${d.customers?.name}`], ['Authorized By', '']].map(([label, sub]) => (
                <div key={label} className="sig-box">
                  <div className="sig-line" />
                  <div className="sig-label">{label}</div>
                  <div style={{ fontSize: 9, color: '#57606a', marginTop: 2 }}>{sub}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 9, color: '#57606a' }}>
              {d.dispatch_number} · Printed: {new Date().toLocaleString('en-PK')} · Jafson Print ERP
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
