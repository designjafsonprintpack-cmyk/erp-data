import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { autoStartArtworkStage } from '@/lib/utils/autoStartArtworkStage'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { artworkSchema } from '@/lib/schemas/artwork'
import { isPageOutOfRange, outOfRangeResponse } from '@/lib/utils/pagedResponse'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('job_id')

  // Two modes. With ?job_id and no ?page it stays what it always was: every
  // version of one job's artwork, newest version first — Job Detail depends on
  // that shape. With ?page it is the Artwork page's list, which used to load a
  // capped 200 rows and filter them in the browser.
  const paged = searchParams.has('page') || searchParams.has('limit')
  if (!jobId && !paged) {
    return NextResponse.json({ error: 'job_id required' }, { status: 400 })
  }

  if (!paged) {
    const { data, error } = await supabase
      .from('job_artworks' as any)
      .select('*')
      .eq('job_id', jobId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('version', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ?? [] })
  }

  const page   = parseInt(searchParams.get('page') || '1')
  const limit  = Math.min(parseInt(searchParams.get('limit') || '50') || 50, 200)
  const offset = (page - 1) * limit

  let q = supabase
    .from('job_artworks' as any)
    .select('*, jobs!job_artworks_job_id_fkey(job_number,job_title,customers(name))', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (jobId) q = q.eq('job_id', jobId)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    // Tiebreaker — versions uploaded together share a created_at.
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)

  // A page past the end is an empty page, not a 500 — see pagedResponse.
  if (isPageOutOfRange(error)) return NextResponse.json(outOfRangeResponse(page, limit))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'artwork', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, artworkSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  // ─── Which design, and which version of it (migration 124) ────────────────
  // A job can carry more than one DESIGN — an HL lid and base, a carton and its
  // insert. Those are not revisions of each other, so `version` counts
  // revisions WITHIN a design and `design_no` says which design.
  //
  // Before 124 every upload took max(version)+1 across the whole job, so a
  // second design became "v2" of the first and vanished from every list, which
  // only ever shows the latest version.
  const { data: onJob, error: readErr } = await supabase
    .from('job_artworks' as any)
    .select('design_no, design_label, version')
    .eq('job_id', body.job_id)
    .eq('company_id', companyId)
    .is('deleted_at', null)

  // Checked, never swallowed: a failed read here would silently restart
  // numbering at design 1 / v1 and collide with the unique index.
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })

  const rows = (onJob ?? []) as any[]
  const maxDesign = rows.length ? Math.max(...rows.map(r => Number(r.design_no) || 1)) : 0

  let designNo: number
  if (body.design_no != null) {
    // Adding a version to a design that must already exist. Creating design 5
    // on a job that has 2 would leave a hole and make "how many designs does
    // this job have" a lie.
    if (body.design_no > maxDesign) {
      return NextResponse.json(
        { error: `This job has ${maxDesign} design${maxDesign === 1 ? '' : 's'}. Leave the design blank to add a new one.` },
        { status: 400 }
      )
    }
    designNo = body.design_no
  } else {
    // No design given → another design. First upload on a job lands on 1.
    designNo = maxDesign + 1
  }

  const inDesign = rows.filter(r => (Number(r.design_no) || 1) === designNo)
  const nextVersion = inDesign.length ? Math.max(...inDesign.map(r => Number(r.version) || 0)) + 1 : 1

  // The LABEL BELONGS TO THE DESIGN, not to one version of it.
  // It is stored per row because that is where the columns are, so a new
  // version uploaded without re-typing the name used to land with a NULL
  // label — and every reader that shows "the latest version of each design"
  // (the thumbnails route, the printed Job Card) then showed a design with no
  // name at all. Caught by the live route walk: design 1 came back as "" once
  // it had a v2. So a version inherits its design's existing name unless the
  // caller deliberately supplies a new one.
  const inheritedLabel = inDesign.map(r => r.design_label).find(Boolean) ?? null
  const designLabel = body.design_label?.trim() || inheritedLabel

  // ─── An upload IS the approval ────────────────────────────────────────────
  // The customer approves on WhatsApp and staff then upload the file that was
  // signed off — so there is no draft stage left to walk through, and a row
  // sitting at 'draft' would only block the workflow's artwork gate for a
  // design everyone has already agreed on. Rows land approved.
  //
  // The previously-approved version of THIS DESIGN is superseded, exactly as
  // PATCH does when a status is changed by hand. Scoped to design_no since
  // 124: job-wide it would archive the lid's approval the moment the base was
  // uploaded, and the gate wants every design approved.
  const now = new Date().toISOString()
  const { error: supersedeErr } = await supabase.from('job_artworks' as any)
    .update({ status: 'archived', is_production_ready: false })
    .eq('job_id', body.job_id)
    .eq('company_id', companyId)
    .eq('design_no', designNo)
    .eq('status', 'approved')
    .is('deleted_at', null)
  // Not fatal — the new row is still the approved one either way — but never
  // swallowed: two rows both reading "approved" is exactly the confusion this
  // supersede exists to prevent.
  if (supersedeErr) console.error('[artwork] supersede failed:', supersedeErr.message)

  const { data, error } = await supabase.from('job_artworks' as any).insert({
    company_id:   companyId,
    job_id:       body.job_id,
    design_no:    designNo,
    design_label: designLabel,
    version:      nextVersion,
    file_name:    body.file_name,
    file_url:     body.file_url,
    file_size:    body.file_size || null,
    file_type:    body.file_type || null,
    designer_notes: body.designer_notes || null,
    status: 'approved',
    is_production_ready: true,
    approved_at: now,
    approved_by: userTableId,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordJobEvent({
    company_id: companyId, job_id: body.job_id,
    event_type: 'artwork_uploaded',
    new_value: `Design ${designNo}${designLabel ? ` (${designLabel})` : ''} v${nextVersion} — ${body.file_name}`,
    notes: 'Approved on upload — customer approval taken on WhatsApp',
    actor_id: userTableId,
  }, supabase)

  // The upload is now the moment artwork work is real, so it starts the
  // Artwork stage — nobody has to remember to click Start. It deliberately
  // does NOT complete it: see autoStartArtworkStage() for why a two-design job
  // makes completing on upload wrong.
  await autoStartArtworkStage(
    supabase, companyId, body.job_id, userTableId,
    'Auto-started — approved artwork uploaded',
  )

  return NextResponse.json({ data })
})
