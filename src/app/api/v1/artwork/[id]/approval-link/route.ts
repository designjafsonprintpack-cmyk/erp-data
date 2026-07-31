import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { artworkApprovalLinkSchema } from '@/lib/schemas/artwork'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { syncJobCurrentStage } from '@/lib/utils/syncJobCurrentStage'
import { buildArtworkShareText, type ArtworkShareContext } from '@/lib/utils/artworkShareText'

const EXPIRY_MS: Record<string, number | null> = {
  '7d':   7  * 24 * 60 * 60 * 1000,
  '14d':  14 * 24 * 60 * 60 * 1000,
  '30d':  30 * 24 * 60 * 60 * 1000,
  'never': null,
}

// POST — generate (or rotate) this artwork version's public approval link.
// Also moves status to 'waiting_customer_approval' if it wasn't already
// there, since sending a link out IS the "now waiting on the customer"
// transition — staff shouldn't have to separately remember to also change
// the status dropdown.
export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'artwork', 'edit', supabase)
  if (denied) return denied

  // Tolerates a missing/empty body (client may POST with no payload to use
  // the default 7d expiry) — parseBody's hard-400-on-unparseable-JSON
  // behavior would be a regression here, so this validates the same schema
  // manually instead, still rejecting anything that IS sent but malformed.
  const rawBody = await req.json().catch(() => ({}))
  const bodyResult = artworkApprovalLinkSchema.safeParse(rawBody)
  if (!bodyResult.success) {
    return NextResponse.json({ error: 'Validation failed', fieldErrors: bodyResult.error.flatten().fieldErrors }, { status: 400 })
  }
  const body = bodyResult.data
  const expiryKey = body.expiry && body.expiry in EXPIRY_MS ? body.expiry : '7d'
  const expiryMs = EXPIRY_MS[expiryKey]

  const token = randomBytes(32).toString('hex')
  const now = new Date()

  const updateData: Record<string, any> = {
    approval_token: token,
    approval_link_created_at: now.toISOString(),
    approval_token_expires_at: expiryMs ? new Date(now.getTime() + expiryMs).toISOString() : null,
  }
  // Only move status forward if it isn't already at/past this point in the
  // flow — re-sending a link for an artwork that's already approved/
  // rejected shouldn't silently reset its outcome.
  //
  // The job/customer/design columns come along for the share message built at
  // the bottom. The embed MUST carry the FK hint: since migration 104 added
  // jobs.proof_artwork_id there are two relationships between these tables and
  // PostgREST refuses to guess, failing the whole query.
  const { data: current } = await supabase.from('job_artworks' as any)
    .select('status, job_id, version, design_no, design_label, jobs!job_artworks_job_id_fkey(job_number, job_title, customers(name))')
    .eq('id', params.id).eq('company_id', companyId).single()
  if (current && ['draft', 'internal_review'].includes((current as any).status)) {
    updateData.status = 'waiting_customer_approval'
  }

  const { data, error } = await supabase.from('job_artworks' as any)
    .update(updateData)
    .eq('id', params.id).eq('company_id', companyId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ─── Auto-start the Artwork workflow stage ─────────────────────────────────
  // Generating the approval link is the real-world signal that artwork work
  // has begun on this job — staff shouldn't have to separately remember to
  // also click "Start" on the Artwork stage. Only acts if the stage is still
  // 'pending' (a stage already started/completed/skipped is left untouched),
  // and only if it isn't blocked by an earlier unfinished stage — same hard
  // sequential rule /api/v1/jobs/[id]/workflow enforces. If blocked, this
  // silently does nothing rather than failing link generation for a
  // sequencing reason the user has no way to fix from this screen — same
  // silent-skip precedent already used by the customer-approval
  // auto-complete logic in /api/v1/public/artwork/[token].
  const jobId = (current as any)?.job_id
  if (jobId) {
    const { data: artworkStage } = await supabase.from('job_stage_progress' as any)
      .select('id, status, sequence_order, workflow_stages!inner(stage_type)')
      .eq('job_id', jobId).eq('company_id', companyId)
      .in('workflow_stages.stage_type', ['artwork', 'artwork_approval'])
      .maybeSingle()

    const stage = artworkStage as any
    if (stage && stage.status === 'pending') {
      const { data: earlierStages } = await supabase.from('job_stage_progress' as any)
        .select('status').eq('job_id', jobId).eq('company_id', companyId)
        .lt('sequence_order', stage.sequence_order)

      const blocked = ((earlierStages ?? []) as any[]).some(e => !['completed', 'skipped'].includes(e.status))
      if (!blocked) {
        const startedAt = new Date().toISOString()
        await supabase.from('job_stage_progress' as any)
          .update({ status: 'in_progress', started_at: startedAt })
          .eq('id', stage.id)

        await recordJobEvent({
          company_id: companyId, job_id: jobId,
          event_type: 'stage_started',
          new_value: 'Artwork',
          notes: 'Auto-started — artwork approval link generated',
          stage_id: stage.id, actor_id: userTableId,
        }, supabase)

        // Mirror the same "first activity on this job" transition the
        // manual stage-start action performs in /api/v1/jobs/[id]/workflow —
        // including the current-stage bookkeeping, so both paths leave the
        // job pointing at the same live stage.
        await supabase.from('jobs' as any)
          .update({ status: 'in_progress' })
          .eq('id', jobId).eq('company_id', companyId)
          .eq('status', 'new')

        await syncJobCurrentStage(supabase, companyId, jobId).catch(() => null)
      }
    }
  }

  const approvalUrl = `${req.nextUrl.origin}/artwork/approve/${token}`

  // ─── What the link IS, sent back with it ──────────────────────────────────
  // A bare token URL says nothing about which job or which design it opens, so
  // four links sent together are indistinguishable to whoever receives them.
  // The route builds the share message once and both screens display it — see
  // artworkShareText.ts.
  const cur = (current as any) ?? {}
  // How many designs this job has: it decides whether the message names the
  // design at all. Few rows per job, so no cap concern.
  const { data: designRows } = await supabase.from('job_artworks' as any)
    .select('design_no')
    .eq('job_id', cur.job_id ?? '')
    .eq('company_id', companyId)
    .is('deleted_at', null)

  const designCount = new Set(((designRows ?? []) as any[]).map(r => Number(r.design_no) || 1)).size

  const share: ArtworkShareContext = {
    url: approvalUrl,
    job_number:    cur.jobs?.job_number ?? null,
    job_title:     cur.jobs?.job_title ?? null,
    customer_name: cur.jobs?.customers?.name ?? null,
    design_no:     cur.design_no ?? 1,
    design_label:  cur.design_label ?? null,
    design_count:  designCount || 1,
    version:       Number(cur.version) || Number((data as any)?.version) || 1,
    expires_at:    (updateData.approval_token_expires_at as string | null) ?? null,
  }

  return NextResponse.json({
    data,
    approval_url: approvalUrl,
    share,
    share_text: buildArtworkShareText(share),
  })
})
