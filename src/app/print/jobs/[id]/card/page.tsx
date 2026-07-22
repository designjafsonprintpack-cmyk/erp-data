import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { notFound } from 'next/navigation'
import { formatDate } from '@/lib/utils/format'

export default async function PrintJobCard({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: job } = await supabase.from('jobs' as any)
    .select('*, customers(name,customer_code,phone)')
    .eq('id', params.id)
    .maybeSingle()

  if (!job) notFound()
  const j = job as any

  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : null
  const { data: companyRow } = companyId
    ? await supabase.from('companies' as any).select('name').eq('id', companyId).maybeSingle()
    : { data: null }
  const companyName = (companyRow as any)?.name || 'Jafson Print Pack'

  const specs = [
    { label: 'Size (L×W×H)', value: [j.size_l, j.size_w, j.size_h].filter(Boolean).join(' × ') + (j.size_l ? ' mm' : '') || '—' },
    { label: 'Sheet Size', value: j.sheet_size || '—' },
    { label: 'Grain Direction', value: j.grain_direction === 'long_grain' ? 'Long Grain' : j.grain_direction === 'short_grain' ? 'Short Grain' : '—' },
    { label: 'Ups', value: j.ups || '—' },
    { label: 'Sheet Qty', value: j.sheet_qty?.toLocaleString() || '—' },
    { label: 'Quantity', value: j.quantity?.toLocaleString() || '—' },
    { label: 'No. of Colors', value: j.no_of_colors || '—' },
    { label: 'Die Number', value: j.die_number || '—' },
    { label: 'UV Coating', value: j.uv_coating || '—' },
    { label: 'Pasting', value: j.pasting || '—' },
    { label: 'Special Finishing', value: j.special_finishing || '—' },
  ]

  return (
    <html>
      <head>
        <title>Job Card — {j.job_number}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 12px; color: #1f2328; background: white; }
          .page { width: 210mm; min-height: 297mm; padding: 15mm; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #0969da; margin-bottom: 16px; }
          .logo { font-size: 18px; font-weight: 700; color: #0969da; }
          .job-number { font-size: 22px; font-weight: 800; font-family: monospace; color: #0969da; }
          .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; border: 1px solid; }
          .badge-new { background: #ddf4ff; color: #0550ae; border-color: #80ccff; }
          .badge-in_progress { background: #fff8c5; color: #7d4e00; border-color: #e3b341; }
          .badge-completed { background: #dafbe1; color: #116329; border-color: #56d364; }
          .badge-on_hold { background: #ffebe9; color: #82071e; border-color: #ff818266; }
          .section { margin-bottom: 14px; }
          .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #57606a; border-bottom: 1px solid #d0d7de; padding-bottom: 4px; margin-bottom: 8px; }
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
          .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 16px; }
          .field { margin-bottom: 4px; }
          .field-label { font-size: 10px; color: #57606a; margin-bottom: 1px; }
          .field-value { font-size: 12px; font-weight: 500; }
          .remarks-box { border: 1px solid #d0d7de; border-radius: 6px; padding: 8px; min-height: 48px; font-size: 12px; margin-top: 4px; }
          .workflow-stages { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
          .stage-badge { padding: 2px 8px; border: 1px solid #d0d7de; border-radius: 4px; font-size: 10px; }
          .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #d0d7de; display: flex; justify-content: space-between; font-size: 10px; color: #57606a; }
          .signature-line { border-bottom: 1px solid #1f2328; width: 150px; height: 36px; }
          @media print { .page { margin: 0; } @page { size: A4; margin: 0; } }
        `}</style>
      </head>
      <body>
        <div className="page">
          {/* Header */}
          <div className="header">
            <div>
              <div className="logo">{companyName}</div>
              <div style={{ fontSize: 11, color: '#57606a', marginTop: 2 }}>Digital Job Card</div>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div className="job-number">{j.job_number}</div>
                <div style={{ marginTop: 4 }}>
                  <span className={`badge badge-${j.status}`}>{j.status?.replace('_', ' ').toUpperCase()}</span>
                  {j.priority !== 'normal' && (
                    <span style={{ marginLeft: 6, fontWeight: 700, color: j.priority === 'urgent' ? '#cf222e' : '#9a6700' }}>
                      {j.priority?.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/v1/print/qr?data=${encodeURIComponent(j.job_number)}`} width={64} height={64} alt={`QR code for ${j.job_number}`} />
            </div>
          </div>

          {/* Customer & Dates */}
          <div className="section">
            <div className="section-title">Job Information</div>
            <div className="grid-2">
              <div>
                <div className="field-label">Job Title</div>
                <div className="field-value" style={{ fontWeight: 700, fontSize: 14 }}>{j.job_title}</div>
              </div>
              <div>
                <div className="field-label">Customer</div>
                <div className="field-value">{j.customers?.name} <span style={{ color: '#57606a', fontSize: 11 }}>({j.customers?.customer_code})</span></div>
              </div>
              <div>
                <div className="field-label">Order Date</div>
                <div className="field-value">{formatDate(j.order_date)}</div>
              </div>
              <div>
                <div className="field-label">Required Date</div>
                <div className="field-value" style={{ fontWeight: 700, color: '#cf222e' }}>
                  {j.required_date ? formatDate(j.required_date) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Specifications */}
          <div className="section">
            <div className="section-title">Product Specifications</div>
            <div className="grid-3">
              {specs.map(s => (
                <div key={s.label} className="field">
                  <div className="field-label">{s.label}</div>
                  <div className="field-value">{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Finishing */}
          <div className="section">
            <div className="section-title">Finishing</div>
            <div className="grid-3">
              <div className="field"><div className="field-label">Lamination</div><div className="field-value">{(j as any).lamination_types?.name || '—'}</div></div>
              <div className="field"><div className="field-label">Hot Foil</div><div className="field-value">{(j as any).foil_types?.name || '—'}</div></div>
              <div className="field"><div className="field-label">UV Coating</div><div className="field-value">{j.uv_coating || '—'}</div></div>
              <div className="field"><div className="field-label">Pasting</div><div className="field-value">{j.pasting || '—'}</div></div>
              <div className="field"><div className="field-label">Special</div><div className="field-value">{j.special_finishing || '—'}</div></div>
            </div>
          </div>

          {/* Internal Remarks */}
          <div className="section">
            <div className="section-title">Internal Remarks</div>
            <div className="remarks-box">{j.internal_remarks || ' '}</div>
          </div>

          {/* Signatures */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 20, marginTop: 20 }}>
            {['Artwork', 'Planning', 'Production', 'QC'].map(dept => (
              <div key={dept} style={{ textAlign: 'center' }}>
                <div className="signature-line" />
                <div style={{ fontSize: 10, color: '#57606a', marginTop: 4 }}>{dept}</div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="footer">
            <div>Printed: {new Date().toLocaleString('en-PK')}</div>
            <div>{j.job_number} — {j.job_title}</div>
            <div>{companyName}</div>
          </div>
        </div>
      </body>
    </html>
  )
}
