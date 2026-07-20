import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/utils/sendEmail'
import { withErrorHandling } from '@/lib/utils/apiHandler'

// Called by Vercel Cron (see vercel.json — runs once daily). Protected by
// CRON_SECRET rather than a user session, since there is no logged-in user
// when Vercel's scheduler fires this. Uses the service-role client for the
// same reason: no auth session to satisfy RLS with.
//
// A schedule is "due" if: daily (always), weekly (last_sent_at was 7+ days
// ago or never sent), monthly (last_sent_at was 28+ days ago or never
// sent). This is checked in application code rather than a SQL interval
// comparison so the logic reads plainly — this endpoint runs once a day at
// most, so the imprecision of "28 days" for "monthly" is fine here.
const REPORT_LABELS: Record<string, string> = {
  kpi: 'KPI Dashboard', monthly_production: 'Monthly Production', customer_sales: 'Customer Sales',
  financial: 'Financial', machines: 'Machine Performance', qc: 'Quality Control', overdue: 'Overdue Jobs',
}

function isDue(frequency: string, lastSentAt: string | null): boolean {
  if (!lastSentAt) return true
  const daysSince = (Date.now() - new Date(lastSentAt).getTime()) / 86400000
  if (frequency === 'daily') return daysSince >= 1
  if (frequency === 'weekly') return daysSince >= 7
  if (frequency === 'monthly') return daysSince >= 28
  return false
}

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const { data: schedules, error } = await supabase.from('report_schedules' as any)
    .select('*, companies(name)').eq('is_active', true).is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent = 0, skipped = 0, failed = 0

  for (const sched of (schedules ?? []) as any[]) {
    if (!isDue(sched.frequency, sched.last_sent_at)) { skipped++; continue }

    const reportLabel = REPORT_LABELS[sched.report_type] || sched.report_type
    const companyName = sched.companies?.name || 'Jafson Print Pack'
    const reportUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/reports`

    let anySent = false
    for (const recipient of sched.recipients as string[]) {
      const result = await sendEmail(
        recipient,
        `${reportLabel} Report — ${companyName}`,
        `<p>Your scheduled <b>${reportLabel}</b> report is ready.</p>
         <p><a href="${reportUrl}">View it in the ERP dashboard</a></p>
         <p>${companyName}</p>`
      )
      if (result.sent) anySent = true
    }

    if (anySent) {
      await supabase.from('report_schedules' as any)
        .update({ last_sent_at: new Date().toISOString() }).eq('id', sched.id)
      sent++
    } else {
      failed++
    }
  }

  return NextResponse.json({ sent, skipped, failed })
})
