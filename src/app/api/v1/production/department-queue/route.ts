import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { checkStageGate } from '@/lib/utils/jobStageGate'

// GET — "my department's queue": every active job currently sitting at (or
// waiting to start) a stage owned by this department, split into
// Ready to Start / Blocked / In Progress. This is the generic version of
// the per-department queues asked for in Feature 4 — it works for any
// stage that has workflow_stages.department_id set (Printing, Die Cutting,
// Pasting, Packing, Dispatch, Artwork, etc.), not just machine-bound ones.
// Plates and MRN aren't workflow stages in this system (they're their own
// modules linked to a job by job_id, not part of job_stage_progress), so
// they don't appear here — the existing Plates and Store/MRN pages remain
// the right place for those.
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  let departmentId = searchParams.get('department_id') || ''

  // 'all' — the whole plant's live work in one list. Needed for anyone who
  // isn't tied to a single department (owner, admin, superadmin, and any user
  // whose department_id was never set), who would otherwise land on some
  // arbitrary department's empty queue and conclude the page is broken. Also
  // the only view that surfaces a stage with NO department assigned — those
  // are invisible to every per-department query by definition.
  const allDepartments = departmentId === 'all'

  if (!allDepartments && !departmentId) {
    const { data: profile } = await supabase.from('users' as any)
      .select('department_id').eq('company_id', companyId).eq('auth_user_id', user.id).maybeSingle()
    departmentId = (profile as any)?.department_id || ''
  }

  if (!allDepartments && !departmentId) {
    return NextResponse.json({ data: { department_id: null, ready: [], blocked: [], in_progress: [] } })
  }

  let query = supabase.from('job_stage_progress' as any)
    .select('id, job_id, sequence_order, workflow_stage_id, status, started_at, workflow_stages!inner(name, department_id, stage_type, departments(name)), jobs(job_number, job_title, priority, required_date, customers(name))')
    .eq('company_id', companyId)
    .in('status', ['pending', 'in_progress'])
    .eq('is_active', true)
    .order('sequence_order')

  if (!allDepartments) query = query.eq('workflow_stages.department_id', departmentId)

  const { data: rows, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Planned date per job, so the queue answers "yeh kab ka plan hai" without
  // anyone opening the Planning page. Earliest live (non-cancelled) plan wins
  // — a job normally has one; if it was re-planned, the nearest date is the
  // one the floor cares about.
  const jobIds = Array.from(new Set(((rows ?? []) as any[]).map(r => r.job_id)))
  const plannedDateByJob = new Map<string, string>()
  if (jobIds.length > 0) {
    const { data: plans } = await supabase.from('job_plans' as any)
      .select('job_id, planned_date, status')
      .eq('company_id', companyId)
      .in('job_id', jobIds)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .order('planned_date')
    for (const p of ((plans ?? []) as any[])) {
      if (!plannedDateByJob.has(p.job_id)) plannedDateByJob.set(p.job_id, p.planned_date)
    }
  }

  const ready: any[] = []
  const blocked: any[] = []
  const inProgress: any[] = []

  for (const row of ((rows ?? []) as any[])) {
    // A cancelled/deleted job can still have live job_stage_progress rows
    // if it was never cleaned up — skip rather than show a queue entry for
    // a job nobody can act on.
    if (!row.jobs) continue

    const entry = {
      stage_progress_id: row.id,
      job_id: row.job_id,
      job_number: row.jobs.job_number,
      job_title: row.jobs.job_title,
      customer_name: row.jobs.customers?.name || null,
      priority: row.jobs.priority,
      required_date: row.jobs.required_date,
      stage_name: row.workflow_stages?.name || 'Stage',
      started_at: row.started_at,
      planned_date: plannedDateByJob.get(row.job_id) ?? null,
      department_name: row.workflow_stages?.departments?.name ?? null,
    }

    if (row.status === 'in_progress') {
      inProgress.push(entry)
      continue
    }

    const gate = await checkStageGate(supabase, companyId, row.job_id, row.workflow_stage_id, row.sequence_order, entry.stage_name)
    if (gate.blocked) {
      blocked.push({ ...entry, blocked_reason: gate.reason })
    } else {
      ready.push(entry)
    }
  }

  return NextResponse.json({
    data: {
      department_id: allDepartments ? 'all' : departmentId,
      ready, blocked, in_progress: inProgress,
    },
  })
})
