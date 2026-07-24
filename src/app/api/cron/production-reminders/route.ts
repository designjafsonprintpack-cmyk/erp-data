import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { checkStageGate } from '@/lib/utils/jobStageGate'
import { notifyDepartment } from '@/lib/utils/notifyDepartment'

// Called by Vercel Cron (see vercel.json — every 15 minutes). Same
// CRON_SECRET + service-role-client pattern as the other cron routes: no
// logged-in user when Vercel's scheduler fires this.
//
// Two things happen here, both from the same query:
//   1. "3 hours before scheduled production, notify every related
//      department" — a reminder for anything scheduled 2h45m-3h15m from
//      now (a 30-minute window, since this runs every 15 minutes — wide
//      enough that no assignment falls through the gap between runs, and
//      reminder_sent_at stops the same assignment being re-notified on
//      the next pass).
//   2. "If any dependency is missing, send a Pending Alert" — checked via
//      the same checkStageGate() the normal start/complete/skip route
//      uses, so this is never out of sync with what would actually block
//      the stage from starting.
//
// IMPORTANT DEPLOYMENT NOTE: Vercel's Hobby plan only allows daily cron
// schedules — a 15-minute schedule needs a Pro (or higher) plan. If still
// on Hobby, this route will simply never fire on the configured schedule
// until upgraded; nothing in the app itself needs to change.
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()

  const windowStart = new Date(Date.now() + 165 * 60_000).toISOString() // +2h45m
  const windowEnd = new Date(Date.now() + 195 * 60_000).toISOString()   // +3h15m

  const { data: dueAssignments, error } = await supabase.from('production_assignments' as any)
    .select('id, company_id, job_id, scheduled_start, stage_progress_id, machines(name), jobs(job_number, job_title)')
    .eq('status', 'queued')
    .is('reminder_sent_at', null)
    .is('deleted_at', null)
    .gte('scheduled_start', windowStart)
    .lte('scheduled_start', windowEnd)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let notified = 0
  let pending = 0

  for (const a of ((dueAssignments ?? []) as any[])) {
    const { data: stageProgress } = await supabase.from('job_stage_progress' as any)
      .select('workflow_stage_id, sequence_order, workflow_stages(name, department_id)')
      .eq('id', a.stage_progress_id).eq('company_id', a.company_id).maybeSingle()

    if (!stageProgress) continue
    const sp = stageProgress as any
    const stageName = sp.workflow_stages?.name || 'Stage'
    const departmentId = sp.workflow_stages?.department_id ?? null

    const gate = await checkStageGate(supabase, a.company_id, a.job_id, sp.workflow_stage_id, sp.sequence_order, stageName)

    const jobLabel = `${a.jobs?.job_number} — ${a.jobs?.job_title}`
    const machineLabel = a.machines?.name ? ` on ${a.machines.name}` : ''
    const scheduledLabel = new Date(a.scheduled_start).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })

    if (gate.blocked) {
      pending++
      await notifyDepartment(supabase, {
        companyId: a.company_id, departmentId,
        title: `⚠ Pending — ${stageName} scheduled soon but blocked`,
        message: `${jobLabel} is scheduled for ${stageName}${machineLabel} at ${scheduledLabel} (in ~3 hours), but ${gate.reason || 'a dependency is not ready yet'}.`,
        linkUrl: `/dashboard/jobs/${a.job_id}`,
        groupKey: `production_pending:${a.id}`,
      }).catch(() => null)
    } else {
      notified++
      await notifyDepartment(supabase, {
        companyId: a.company_id, departmentId,
        title: `${stageName} scheduled in ~3 hours`,
        message: `${jobLabel} is scheduled for ${stageName}${machineLabel} at ${scheduledLabel}.`,
        linkUrl: `/dashboard/jobs/${a.job_id}`,
        groupKey: `production_reminder:${a.id}`,
      }).catch(() => null)
    }

    await supabase.from('production_assignments' as any)
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', a.id).eq('company_id', a.company_id)
  }

  return NextResponse.json({ ok: true, reminders_sent: notified, pending_alerts_sent: pending })
})
