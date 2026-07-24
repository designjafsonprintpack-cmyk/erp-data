import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { checkStageGate } from '@/lib/utils/jobStageGate'

// GET — everything the Production Command Center dashboard needs in one
// call: KPI counts, per-machine current+next job, a blocked/overdue alerts
// feed, and a sheets-printed trend (week/month/year).
//
// Sheets-printed is derived from existing data rather than a new counter:
// every time a job's Printing stage (stage_type='printing') is marked
// completed, job_stage_progress.completed_at is stamped and the job's own
// sheet_qty (already computed at job creation — ceil(box_qty/ups)) is the
// real sheet count for that run. Summing sheet_qty for jobs whose Printing
// stage completed within a period is the real answer to "how many sheets
// did we print this week/month/year" without inventing a new tracking
// mechanism the shop floor would have to remember to fill in.
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const period = (searchParams.get('period') || 'week') as 'week' | 'month' | 'year'

  // ─── KPIs ────────────────────────────────────────────────────────────────
  const { count: jobsInProgress } = await supabase.from('jobs' as any)
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('status', 'in_progress').is('deleted_at', null)

  const { count: machinesRunning } = await supabase.from('production_assignments' as any)
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('status', 'running').is('deleted_at', null)

  const { count: machinesTotal } = await supabase.from('machines' as any)
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('is_active', true).is('deleted_at', null)

  const today = new Date().toISOString().slice(0, 10)
  const { count: overdueJobs } = await supabase.from('jobs' as any)
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId).is('deleted_at', null)
    .lt('required_date', today)
    .not('status', 'in', '("completed","dispatched","cancelled")')

  // ─── Machine grid: current job (machine_floor_status view) + next queued ──
  const { data: machineStatus } = await supabase.from('machine_floor_status' as any)
    .select('*').eq('company_id', companyId).order('machine_name')

  const { data: queuedAssignments } = await supabase.from('production_assignments' as any)
    .select('id, machine_id, scheduled_start, jobs(job_number, job_title)')
    .eq('company_id', companyId).eq('status', 'queued').is('deleted_at', null)
    .order('scheduled_start', { ascending: true })

  const nextByMachine = new Map<string, any>()
  for (const a of ((queuedAssignments ?? []) as any[])) {
    if (!nextByMachine.has(a.machine_id)) nextByMachine.set(a.machine_id, a)
  }

  const machines = ((machineStatus ?? []) as any[]).map(m => {
    const next = nextByMachine.get(m.machine_id)
    // Don't show the same assignment as both "current" and "next".
    const nextIsCurrent = next && m.assignment_id && next.id === m.assignment_id
    return {
      machine_id: m.machine_id, machine_name: m.machine_name, machine_type: m.machine_type,
      current_job: m.job_id ? { job_id: m.job_id, job_number: m.job_number, job_title: m.job_title, stage_name: m.stage_name, status: m.assignment_status } : null,
      next_job: (!nextIsCurrent && next?.jobs) ? { job_number: next.jobs.job_number, job_title: next.jobs.job_title, scheduled_start: next.scheduled_start } : null,
    }
  })

  // ─── Alerts feed: blocked pending stages on active jobs + overdue jobs ────
  const { data: activeJobs } = await supabase.from('jobs' as any)
    .select('id, job_number, job_title, required_date')
    .eq('company_id', companyId).eq('status', 'in_progress').is('deleted_at', null)
    .limit(100)

  const alerts: { type: 'blocked' | 'overdue'; job_number: string; job_title: string; detail: string }[] = []

  for (const job of ((activeJobs ?? []) as any[])) {
    if (job.required_date && job.required_date < today) {
      alerts.push({ type: 'overdue', job_number: job.job_number, job_title: job.job_title, detail: `Was due ${job.required_date}` })
    }
  }

  // Only check stage gates for a bounded set of jobs (most-recently-touched
  // active jobs) — this is a live dashboard, not a full audit; capping keeps
  // it fast on a shop with a large open job count.
  const jobIdsToCheck = ((activeJobs ?? []) as any[]).slice(0, 30).map(j => j.id)
  if (jobIdsToCheck.length > 0) {
    const { data: pendingStages } = await supabase.from('job_stage_progress' as any)
      .select('job_id, workflow_stage_id, sequence_order, status, workflow_stages(name), jobs(job_number, job_title)')
      .eq('company_id', companyId).in('job_id', jobIdsToCheck).eq('status', 'pending')

    for (const stage of ((pendingStages ?? []) as any[])) {
      const gate = await checkStageGate(supabase, companyId, stage.job_id, stage.workflow_stage_id, stage.sequence_order, stage.workflow_stages?.name || 'Stage')
      if (gate.blocked) {
        alerts.push({
          type: 'blocked', job_number: stage.jobs?.job_number || '', job_title: stage.jobs?.job_title || '',
          detail: gate.reason || `${stage.workflow_stages?.name || 'Stage'} is blocked`,
        })
      }
    }
  }

  // ─── Sheets printed trend ──────────────────────────────────────────────────
  const now = new Date()
  const buckets: { label: string; start: Date; end: Date }[] = []
  if (period === 'week') {
    for (let i = 7; i >= 0; i--) {
      const end = new Date(now); end.setDate(end.getDate() - i * 7)
      const start = new Date(end); start.setDate(start.getDate() - 6)
      buckets.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, start, end })
    }
  } else if (period === 'month') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const start = new Date(d.getFullYear(), d.getMonth(), 1)
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      buckets.push({ label: start.toLocaleString('en-US', { month: 'short' }), start, end })
    }
  } else {
    for (let i = 4; i >= 0; i--) {
      const y = now.getFullYear() - i
      buckets.push({ label: String(y), start: new Date(y, 0, 1), end: new Date(y, 11, 31) })
    }
  }

  const earliestStart = buckets[0].start.toISOString()
  const { data: printedStages } = await supabase.from('job_stage_progress' as any)
    .select('completed_at, jobs(sheet_qty), workflow_stages!inner(stage_type)')
    .eq('company_id', companyId)
    .eq('workflow_stages.stage_type', 'printing')
    .eq('status', 'completed')
    .gte('completed_at', earliestStart)

  const sheetsTrend = buckets.map(b => {
    const sheets = ((printedStages ?? []) as any[])
      .filter(row => {
        if (!row.completed_at) return false
        const d = new Date(row.completed_at)
        return d >= b.start && d <= b.end
      })
      .reduce((sum, row) => sum + Number(row.jobs?.sheet_qty || 0), 0)
    return { label: b.label, sheets }
  })

  return NextResponse.json({
    data: {
      kpis: {
        jobs_in_progress: jobsInProgress ?? 0,
        machines_running: machinesRunning ?? 0,
        machines_total: machinesTotal ?? 0,
        overdue_jobs: overdueJobs ?? 0,
      },
      machines,
      alerts: alerts.slice(0, 15),
      sheets_trend: sheetsTrend,
    },
  })
})
