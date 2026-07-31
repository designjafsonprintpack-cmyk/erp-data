/**
 * Which jobs could gang with this one, and what the numbers would be.
 *
 * GET ?job_id=…                     → the jobs it could physically share a sheet with
 * GET ?job_id=…&with=<id,id>&layout_ups=8[&ups=<id:3,id:5>]
 *                                   → both scenarios, run separately vs ganged
 *
 * The preview is computed HERE rather than only in the browser so the screen
 * and the create route can never disagree about what a split produces — they
 * call the same `gangScenario()`.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { gangScenario, separateScenario, suggestSplit, type GangMemberInput } from '@/lib/utils/gangCalc'

const JOB_COLS = 'id,job_number,job_title,customer_id,quantity,ups,sheet_qty,die_number,' +
                 'board_type_id,sheet_width_in,sheet_height_in,status,no_of_colors,' +
                 'customers(name),board_types(name)'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'planning', 'view', supabase)
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('job_id')
  if (!jobId) return NextResponse.json({ error: 'job_id is required' }, { status: 400 })

  const { data: baseJob, error: bErr } = await supabase.from('jobs' as any)
    .select(JOB_COLS).eq('id', jobId).eq('company_id', companyId).is('deleted_at', null).maybeSingle()
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })
  if (!baseJob) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const base = baseJob as any

  // ─── Who could share this sheet ──────────────────────────────────────────
  // Same customer, same board, same sheet size — the three things that make
  // one sheet physically possible. Not a preference: two jobs on different
  // board simply cannot be printed together.
  let q = supabase.from('jobs' as any)
    .select(JOB_COLS)
    .eq('company_id', companyId).is('deleted_at', null).eq('is_active', true)
    .eq('job_kind', 'production')
    .eq('customer_id', base.customer_id)
    .neq('id', jobId)
    .not('status', 'in', '("completed","dispatched","cancelled")')
    .limit(50)

  if (base.board_type_id) q = q.eq('board_type_id', base.board_type_id)
  if (base.sheet_width_in != null) q = q.eq('sheet_width_in', base.sheet_width_in)
  if (base.sheet_height_in != null) q = q.eq('sheet_height_in', base.sheet_height_in)

  const { data: sameSheet, error: cErr } = await q.order('created_at', { ascending: false }).order('id')
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  // Drop anything already in a live gang — a job runs in at most one.
  const ids = [base.id, ...((sameSheet ?? []) as any[]).map(j => j.id)]
  const { data: ganged } = await supabase.from('job_gang_members' as any)
    .select('job_id, job_gangs(gang_number)')
    .in('job_id', ids).eq('company_id', companyId).is('deleted_at', null)
  const gangedBy = new Map(((ganged ?? []) as any[]).map(g => [g.job_id, g.job_gangs?.gang_number ?? 'another gang']))

  const candidates = ((sameSheet ?? []) as any[]).filter(j => !gangedBy.has(j.id))

  // ─── Preview, when a selection was passed ────────────────────────────────
  const withIds = (searchParams.get('with') || '').split(',').map(s => s.trim()).filter(Boolean)
  const layoutUps = parseInt(searchParams.get('layout_ups') || '0')
  let preview: any = null

  if (withIds.length) {
    const chosen = [base, ...candidates.filter(j => withIds.includes(j.id))]
    const members: GangMemberInput[] = chosen.map(j => ({
      jobId: j.id,
      jobNumber: j.job_number,
      jobTitle: j.job_title,
      orderedQty: Number(j.quantity) || 0,
      ownUps: Number(j.ups) || 0,
    }))

    // An explicit split wins; otherwise a suggestion the planner will overwrite.
    // `ups=<id>:3,<id>:5`
    const upsParam = searchParams.get('ups') || ''
    let upsByJob: Record<string, number> = {}
    if (upsParam) {
      for (const pair of upsParam.split(',')) {
        const [id, n] = pair.split(':')
        if (id && n) upsByJob[id.trim()] = parseInt(n)
      }
    } else if (layoutUps > 0) {
      upsByJob = suggestSplit(layoutUps, members)
    }

    preview = {
      separate: separateScenario(members),
      gang: layoutUps > 0 ? gangScenario(layoutUps, members, upsByJob) : null,
      ups: upsByJob,
      // Stated plainly: the ERP has no die master, so it cannot know what
      // layouts exist. Whatever it offers is a starting point.
      ups_is_suggestion: !upsParam,
    }
  }

  return NextResponse.json({
    job: base,
    candidates,
    already_ganged: Array.from(gangedBy.entries()).map(([job_id, gang_number]) => ({ job_id, gang_number })),
    preview,
  })
})
