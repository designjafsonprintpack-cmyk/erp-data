import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { notFound } from 'next/navigation'
import { formatDate } from '@/lib/utils/format'
import { getIssuedGsm, formatIssuedGsm, hasGsmVariance } from '@/lib/utils/jobIssuedGsm'
import { changeAspectPrintLabels } from '@/modules/jobs/constants/changeAspects'

/** Same extension set as isPreviewable() in ArtworkThumb.tsx, duplicated
 *  because this page renders plain HTML/CSS (no Tailwind, no client
 *  components) and signs the URL itself rather than going through the
 *  ArtworkThumb component or its hooks. */
const PREVIEWABLE_EXT = new Set(['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'BMP', 'SVG', 'AVIF'])

export default async function PrintJobCard({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: job } = await supabase.from('jobs' as any)
    // lamination_types / foil_types were rendered below but never joined, so
    // Lamination and Hot Foil printed as "—" on every card. board/paper too,
    // which the card did not show at all — see the specs list.
    .select('*, customers(name,customer_code,phone), box_types(name), board_types(name), paper_types(name), lamination_types(name), foil_types(name)')
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

  // Planned vs actually-issued GSM. The shop floor needs the planned figure;
  // whoever reconciles cost afterwards needs to see when they diverged.
  const issuedGsm = companyId ? await getIssuedGsm(supabase, companyId, params.id) : []
  const issuedGsmText = formatIssuedGsm(issuedGsm)
  const gsmVariance = hasGsmVariance(j.gsm, issuedGsm)

  // Latest artwork version's thumbnail, if there is one and it's an image.
  // Print cards are single-job pages, so this is one query and (at most) one
  // signed URL — no batching needed the way a list of jobs would.
  // EVERY design, latest version of each (migration 124) — not just the newest
  // row on the job. A job can carry two separate designs (an HL lid and base,
  // a carton and its insert), and this sheet is what the operator holds at the
  // press: printing one design's picture while the other runs is exactly the
  // mistake the Job Card exists to prevent.
  const { data: artworkRows } = await supabase.from('job_artworks' as any)
    .select('file_url, file_name, file_type, design_no, design_label, version')
    .eq('job_id', params.id).is('deleted_at', null)
    .order('design_no', { ascending: true })
    .order('version', { ascending: false })

  const latestPerDesign: any[] = []
  const seenDesign = new Set<number>()
  for (const a of ((artworkRows ?? []) as any[])) {
    const d = a.design_no ?? 1
    if (seenDesign.has(d)) continue
    seenDesign.add(d)
    latestPerDesign.push(a)
  }

  // Signed in one batch rather than a call per design.
  const printable = latestPerDesign.filter(a =>
    PREVIEWABLE_EXT.has((a.file_type || String(a.file_name).split('.').pop() || '').toUpperCase()))
  const artworkThumbs: { url: string; label: string }[] = []
  if (printable.length) {
    const { data: signed } = await supabase.storage.from('artwork')
      .createSignedUrls(printable.map(a => a.file_url), 3600)
    // Mapped by index, not by the returned path, which Storage may normalise —
    // the same rule the thumbnails route and the client hook both follow.
    signed?.forEach((row, i) => {
      const src = printable[i]
      if (row?.signedUrl && src) {
        artworkThumbs.push({
          url: row.signedUrl,
          label: src.design_label || (seenDesign.size > 1 ? `Design ${src.design_no ?? 1}` : ''),
        })
      }
    })
  }

  // A repeat whose printed content changed (migration 097). The parent's number
  // is looked up so the card can say which job this differs FROM — the operator
  // has almost certainly run that one before.
  const isChangedRepeat = j.repeat_kind === 'changed'
  const changedLabels = isChangedRepeat ? changeAspectPrintLabels(j.changed_aspects) : []
  let parentJobNumber: string | null = null
  if (isChangedRepeat && j.parent_job_id) {
    const { data: parent } = await supabase.from('jobs' as any)
      .select('job_number').eq('id', j.parent_job_id).maybeSingle()
    parentJobNumber = (parent as any)?.job_number ?? null
  }

  const specs = [
    { label: 'Size (L×W×H)', value: [j.size_l, j.size_w, j.size_h].filter(Boolean).join(' × ') + (j.size_l ? ' mm' : '') || '—' },
    { label: 'Sheet Size', value: j.sheet_width_in && j.sheet_height_in ? `${j.sheet_width_in} × ${j.sheet_height_in} in` : '—' },
    { label: 'Box Type', value: j.box_types?.name || '—' },
    // The card told the floor the GSM but never which board to draw — the one
    // thing the store needs off this sheet.
    { label: 'Board / Paper', value: j.board_types?.name || j.paper_types?.name || '—' },
    { label: 'GSM (planned)', value: j.gsm ? String(j.gsm) : '—' },
    { label: 'GSM (issued)', value: issuedGsmText || 'Not issued yet', flag: gsmVariance },
    { label: 'Ups', value: j.ups || '—' },
    { label: 'Sheet Qty', value: j.sheet_qty?.toLocaleString() || '—' },
    { label: 'Quantity', value: j.quantity?.toLocaleString() || '—' },
    { label: 'No. of Colors', value: j.no_of_colors || '—' },
    { label: 'Die Number', value: j.die_number || '—' },
    // Coating / Pasting / Special Finishing deliberately NOT listed here — they
    // are printed once, in the Finishing section below, beside Lamination and
    // Hot Foil where the operator looks for them. They used to appear in both
    // blocks on the same sheet.
  ]

  return (
    <html>
      <head>
        <title>Job Card — {j.job_number}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 12px; color: #1f2328; background: white; }
          /* Flex column so the signature strip can be pushed to the foot of the
             sheet regardless of how short the job's content is. */
          .page { width: 210mm; min-height: 297mm; padding: 15mm; margin: 0 auto; display: flex; flex-direction: column; }
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
          /* margin-top: auto eats every bit of leftover height, so the signatures
             sit on the bottom margin of the page instead of floating just below
             the remarks box on a short job. The footer follows them down. */
          .signatures { margin-top: auto; padding-top: 24px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
          .signature-line { border-bottom: 1px solid #1f2328; width: 150px; height: 36px; margin: 0 auto; }
          /* object-fit: contain, not cover — same reason as ArtworkThumb.
             30mm x 38mm is portrait and a dieline is landscape, so cover was
             cropping the sides off. This is the sheet the operator holds at the
             press to check he has mounted the right job; a cropped preview is
             worse than a small one. White letterboxing is invisible on paper. */
          .artwork-thumb { width: 30mm; height: 38mm; object-fit: contain; border: 1px solid #d0d7de; border-radius: 4px; flex-shrink: 0; }
          /* One cell per design, so a two-design job prints both side by side.
             Hardcoded hex like the rest of this file — print must never follow
             the theme (CLAUDE.md §3). */
          .artwork-cell { display: flex; flex-direction: column; align-items: center; gap: 1mm; flex-shrink: 0; }
          .artwork-caption { font-size: 8px; color: #57606a; max-width: 30mm; text-align: center;
                             overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          /* Changed-repeat banner. Deliberately the loudest thing on the sheet:
             the operator has run this job before and will reach for the old
             plate out of habit unless something stops them. Heavy border rather
             than a colour fill so it survives a black-and-white printer. */
          .changed-banner { border: 3px solid #cf222e; border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; background: #ffebe9; }
          .changed-title { font-size: 16px; font-weight: 800; color: #82071e; letter-spacing: 0.02em; }
          .changed-tags { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 5px; }
          .changed-tag { border: 2px solid #cf222e; border-radius: 4px; padding: 2px 8px; font-size: 13px; font-weight: 800; color: #82071e; }
          .changed-note { margin-top: 7px; font-size: 12px; color: #1f2328; }
          .changed-sub { margin-top: 6px; font-size: 11px; font-weight: 600; color: #82071e; }
          @media print { .page { margin: 0; } @page { size: A4; margin: 0; } }
          /* On a phone screen the A4 sheet (210mm ≈ 794px) forces pinch-zoom.
             Reflow it to the screen for READING only — the printed output above
             is untouched. Tables keep their shape and scroll sideways. */
          @media screen and (max-width: 840px) {
            .page { width: 100%; min-height: auto; padding: 16px; }
            table { display: block; overflow-x: auto; white-space: nowrap; }
          }
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
              {/* One tile per DESIGN. A job with a lid and a base prints both,
                  each labelled, so the press has the whole job in front of it. */}
              {artworkThumbs.map((t, i) => (
                <div key={i} className="artwork-cell">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not a local asset */}
                  <img className="artwork-thumb" src={t.url} alt={`${t.label || 'Artwork'} for ${j.job_number}`} />
                  {t.label && <div className="artwork-caption">{t.label}</div>}
                </div>
              ))}
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

          {/* Changed-repeat warning — sits above everything else on purpose */}
          {isChangedRepeat && (
            <div className="changed-banner">
              <div className="changed-title">
                ⚠ REPEAT WITH CHANGES — DO NOT USE OLD PLATES OR ARTWORK
              </div>
              {changedLabels.length > 0 && (
                <div className="changed-tags">
                  {changedLabels.map(label => (
                    <span key={label} className="changed-tag">{label} CHANGED</span>
                  ))}
                </div>
              )}
              {j.change_note && <div className="changed-note">{j.change_note}</div>}
              {parentJobNumber && (
                <div className="changed-sub">Repeat of {parentJobNumber} — check every change against the approved artwork before printing.</div>
              )}
            </div>
          )}

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
                  <div className="field-value">
                    {s.value}
                    {(s as any).flag ? ' \u26a0 differs from planned' : ''}
                  </div>
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
              <div className="field"><div className="field-label">Coating</div><div className="field-value">{j.uv_coating || '—'}</div></div>
              <div className="field"><div className="field-label">Pasting</div><div className="field-value">{j.pasting || '—'}</div></div>
              <div className="field"><div className="field-label">Special Finishing</div><div className="field-value">{j.special_finishing || '—'}</div></div>
            </div>
          </div>

          {/* Internal Remarks */}
          <div className="section">
            <div className="section-title">Internal Remarks</div>
            <div className="remarks-box">{j.internal_remarks || ' '}</div>
          </div>

          {/* Signatures — pinned to the bottom of the A4 sheet by .signatures'
              margin-top:auto (the .page is a flex column). Artwork does not sign
              here: artwork is signed off by the CUSTOMER on the approval link,
              and that approval is what opens the workflow's artwork gate — a
              second pen-and-paper signature for it on the shop's own card was
              recording the same thing twice. */}
          <div className="signatures">
            {['Planning', 'Production', 'QC'].map(dept => (
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
