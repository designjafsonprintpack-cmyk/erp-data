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

  if (!departmentId) {
    const { data: profile } = await supabase.from('users' as any)
      .select('department_id').eq('company_id', companyId).eq('auth_user_id', user.id).maybeSingle()
    departmentId = (profile as any)?.department_id || ''
  }

  if (!departmentId) {
    return NextResponse.json({ data: { department_id: null, ready: [], blocked: [], in_progress: [] } })
  }

  const { data: rows, error } = await supabase.from('job_stage_progress' as any)
    .select('id, job_id, sequence_order, workflow_stage_id, status, started_at, workflow_stages!inner(name, department_id, stage_type), jobs(job_number, job_title, priority, required_date, customers(name))')
    .eq('company_id', companyId)
    .eq('workflow_stages.department_id', departmentId)
    .in('status', ['pending', 'in_progress'])
    .eq('is_active', true)
    .order('sequence_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

  return NextResponse.json({ data: { department_id: departmentId, ready, blocked, in_progress: inProgress } })
})
