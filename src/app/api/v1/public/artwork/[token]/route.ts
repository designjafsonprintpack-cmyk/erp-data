import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { notifyArtworkStatusChange } from '@/lib/utils/notifyArtworkStatusChange'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { rateLimit, getClientIp } from '@/lib/utils/rateLimit'
import { parseBody } from '@/lib/utils/validate'
import { publicArtworkActionSchema } from '@/lib/schemas/publicToken'

// Public, unauthenticated — reachable from the shared link, same trust
// model as /api/v1/public/quotations/[token]: every query is scoped by the
// token itself, never by an auth session, using the service-role client
// because there's no logged-in user/company to satisfy RLS with.
export const GET = withErrorHandling(async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const limited = rateLimit(`public-artwork-view:${getClientIp(req)}`, { windowMs: 5 * 60_000, max: 30 })
  if (limited) return limited

  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase.from('job_artworks' as any)
    .select('id, job_id, version, file_url, file_name, status, designer_notes, approval_token_expires_at, company_id, jobs!job_artworks_job_id_fkey(job_number, job_title, customers(name))')
    .eq('approval_token', params.token)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) return NextResponse.json({ error: 'This approval link is invalid.' }, { status: 404 })

  const row = data as any
  const expiresAt = row.approval_token_expires_at
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return NextResponse.json({ error: 'This approval link has expired. Please ask us to resend it.' }, { status: 410 })
  }

  const { data: companyRow } = await supabase.from('companies' as any).select('name').eq('id', row.company_id).maybeSingle()
  const companyName = (companyRow as any)?.name || 'Jafson Print Pack'

  // Signed URL for the private artwork bucket — the customer never gets a
  // raw storage path or a direct/public bucket URL.
  const { data: signed } = await supabase.storage.from('artwork').createSignedUrl(row.file_url, 3600)

  // Only customer-authored comments are ever sent back here — internal
  // staff notes are a separate, staff-only thread (see
  // /api/v1/artwork/[id]/comments) and must never leak to this public
  // endpoint even if written about the same artwork version.
  const { data: comments } = await supabase.from('artwork_comments' as any)
    .select('id, comment_text, comment_type, shape, position_x, position_y, resolved, created_at')
    .eq('artwork_id', row.id).eq('author_type', 'customer')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    data: {
      id: row.id, version: row.version, status: row.status, file_name: row.file_name,
      designer_notes: row.designer_notes, preview_url: signed?.signedUrl || null,
      job_number: row.jobs?.job_number, job_title: row.jobs?.job_title, customer_name: row.jobs?.customers?.name,
      comments: comments ?? [], company_name: companyName,
    },
  })
})

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const limited = rateLimit(`public-artwork-action:${getClientIp(req)}`, { windowMs: 5 * 60_000, max: 20 })
  if (limited) return limited

  const supabase = createSupabaseAdminClient()
  const parsed = await parseBody(req, publicArtworkActionSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data
  const action = body.action

  const { data: artwork, error: findErr } = await supabase.from('job_artworks' as any)
    .select('id, company_id, job_id, version, status, approval_token_expires_at')
    .eq('approval_token', params.token)
    .is('deleted_at', null)
    .maybeSingle()

  if (findErr || !artwork) return NextResponse.json({ error: 'This approval link is invalid.' }, { status: 404 })

  const art = artwork as any
  const expiresAt = art.approval_token_expires_at
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return NextResponse.json({ error: 'This approval link has expired. Please ask us to resend it.' }, { status: 410 })
  }

  // Comments are allowed regardless of the current approval status — a
  // customer can point something out even before/after their final
  // decision — so this branch returns early, before the
  // already-approved/rejected guard below (which only applies to changing
  // the approval decision itself). Comments don't carry approver identity —
  // that's only required for the decision itself (enforced by the schema).
  if (action === 'comment') {
    if (!body.comment_text?.trim()) return NextResponse.json({ error: 'Comment text is required' }, { status: 400 })
    const { data: comment, error: commentErr } = await supabase.from('artwork_comments' as any).insert({
      company_id: art.company_id,
      artwork_id: art.id,
      author_type: 'customer',
      author_name: body.author_name?.trim() || null,
      comment_text: body.comment_text.trim(),
      // Anything other than an explicit 'emboss' stays an ordinary comment —
      // never trust the public body to widen this.
      comment_type: body.comment_type === 'emboss' ? 'emboss' : 'comment',
      shape: body.shape ?? null,
      position_x: typeof body.position_x === 'number' ? body.position_x : null,
      position_y: typeof body.position_y === 'number' ? body.position_y : null,
    }).select('id, comment_text, comment_type, shape, position_x, position_y, resolved, created_at').single()

    if (commentErr) return NextResponse.json({ error: commentErr.message }, { status: 500 })
    return NextResponse.json({ data: comment })
  }

  // A whole drawing session in one insert. Same early-return reasoning as
  // 'comment' above: marking up is allowed whatever the approval status is,
  // and carries no approver identity.
  if (action === 'save_marks') {
    const rows = (body.marks ?? []).map(m => ({
      company_id: art.company_id,
      artwork_id: art.id,
      author_type: 'customer',
      author_name: body.author_name?.trim() || null,
      comment_text: m.comment_text.trim(),
      comment_type: m.comment_type === 'emboss' ? 'emboss' : 'comment',
      shape: m.shape ?? null,
      position_x: typeof m.position_x === 'number' ? m.position_x : null,
      position_y: typeof m.position_y === 'number' ? m.position_y : null,
    }))

    const { data: saved, error: saveErr } = await supabase.from('artwork_comments' as any)
      .insert(rows)
      .select('id, comment_text, comment_type, shape, position_x, position_y, resolved, created_at')

    if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 })
    return NextResponse.json({ data: saved ?? [] })
  }

  if (['approved', 'rejected'].includes(art.status)) {
    return NextResponse.json({ error: `This artwork has already been ${art.status}.` }, { status: 409 })
  }

  const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'changes_requested'
  const decidedAt = new Date().toISOString()

  if (newStatus === 'approved') {
    // Supersede any other approved version of the same job, same rule as
    // the internal PATCH route.
    await supabase.from('job_artworks' as any)
      .update({ status: 'archived', is_production_ready: false })
      .eq('job_id', art.job_id).eq('company_id', art.company_id)
      .eq('status', 'approved').neq('id', art.id)
  }

  const { error: updateErr } = await supabase.from('job_artworks' as any).update({
    status: newStatus,
    is_production_ready: newStatus === 'approved',
    approved_at: newStatus === 'approved' ? decidedAt : null,
    // decided_at is set for ANY decision (approve/reject/request_changes) —
    // approved_at (existing column) stays specific to the 'approved' case
    // only, matching what existing UI/API code already expects from it.
    decided_at: decidedAt,
    approver_name: body.approver_name!.trim(),
    // Optional — blank stays NULL rather than an empty string, so the staff-side
    // `art.approver_email && ...` guards keep working unchanged.
    approver_email: body.approver_email?.trim() || null,
    designer_notes: body.notes ? `${body.notes}` : undefined,
  }).eq('id', art.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await recordJobEvent({
    company_id: art.company_id, job_id: art.job_id,
    event_type: 'artwork_status_changed',
    old_value: `v${art.version}: ${art.status}`,
    new_value: `v${art.version}: ${newStatus}`,
    notes: body.notes
      ? `${body.approver_name}, via approval link: ${body.notes}`
      : `${body.approver_name}, via approval link`,
    actor_id: null,
  }, supabase)

  await notifyArtworkStatusChange(supabase, {
    companyId: art.company_id, jobId: art.job_id, artworkVersion: art.version, newStatus,
  })

  // Auto-complete the "Customer Approval" workflow stage when the customer
  // approves — confirmed with Mehboob rather than requiring staff to
  // separately remember to mark it done. Only if every earlier stage in the
  // job's workflow is itself already completed/skipped (same sequential
  // rule the normal stage-advance route enforces) — if Artwork itself
  // hasn't been completed internally yet, this silently skips the
  // auto-complete rather than failing the customer's approval action for a
  // sequencing reason they have no way to know about or fix.
  if (newStatus === 'approved') {
    const { data: stage } = await supabase.from('job_stage_progress' as any)
      .select('id, sequence_order, status, workflow_stages!inner(stage_type)')
      .eq('job_id', art.job_id).eq('company_id', art.company_id)
      .in('workflow_stages.stage_type', ['customer_approval', 'artwork_approval'])
      .maybeSingle()

    if (stage && (stage as any).status !== 'completed') {
      const s = stage as any
      const { data: earlierStages } = await supabase.from('job_stage_progress' as any)
        .select('status').eq('job_id', art.job_id).eq('company_id', art.company_id)
        .lt('sequence_order', s.sequence_order)

      const blocked = ((earlierStages ?? []) as any[]).some(e => !['completed', 'skipped'].includes(e.status))
      if (!blocked) {
        await supabase.from('job_stage_progress' as any).update({
          status: 'completed', completed_at: new Date().toISOString(),
          notes: 'Auto-completed — customer approved artwork via approval link',
        }).eq('id', s.id)

        await recordJobEvent({
          company_id: art.company_id, job_id: art.job_id,
          event_type: 'stage_completed',
          new_value: 'Customer Approval',
          notes: 'Auto-completed — customer approved artwork via approval link',
          stage_id: s.id, actor_id: null,
        }, supabase)
      }
    }
  }

  return NextResponse.json({ success: true, status: newStatus })
})

// Undo for a mark the customer already saved. The in-editor Undo button covers
// the drawing session itself; this covers "I saved it and then changed my mind".
//
// Public and unauthenticated, so the scoping is deliberately narrow: the row
// must belong to THIS artwork (found via the token, never from the request)
// AND be customer-authored, so a link holder can never touch internal staff
// notes or another job's comments. Soft delete, like everywhere else.
export const DELETE = withErrorHandling(async function DELETE(req: NextRequest, { params }: { params: { token: string } }) {
  const limited = rateLimit(`public-artwork-action:${getClientIp(req)}`, { windowMs: 5 * 60_000, max: 20 })
  if (limited) return limited

  const commentId = req.nextUrl.searchParams.get('comment_id')
  if (!commentId) return NextResponse.json({ error: 'comment_id is required' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  const { data: artwork, error: findErr } = await supabase.from('job_artworks' as any)
    .select('id, status, approval_token_expires_at')
    .eq('approval_token', params.token)
    .is('deleted_at', null)
    .maybeSingle()

  if (findErr || !artwork) return NextResponse.json({ error: 'This approval link is invalid.' }, { status: 404 })

  const art = artwork as any
  if (art.approval_token_expires_at && new Date(art.approval_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This approval link has expired. Please ask us to resend it.' }, { status: 410 })
  }

  // Once a decision is final the marks are part of that record — same reason
  // the decision itself can't be changed.
  if (['approved', 'rejected'].includes(art.status)) {
    return NextResponse.json({ error: `This artwork has already been ${art.status}.` }, { status: 409 })
  }

  const { error: delErr } = await supabase.from('artwork_comments' as any)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId)
    .eq('artwork_id', art.id)
    .eq('author_type', 'customer')
    .is('deleted_at', null)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
