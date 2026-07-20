import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import ReportSchedulesClient from './ReportSchedulesClient'

export default async function ReportSchedulesPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const companyId = await getCompanyId(user, supabase)
  const { data } = await supabase.from('report_schedules' as any)
    .select('*').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false })

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Scheduled Report Emails</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          Automatically email a report to a list of recipients on a recurring basis. Sending requires
          Resend to be configured (see Notifications settings) — schedules will show as &quot;not sent yet&quot;
          until that&apos;s set up.
        </p>
      </div>
      <ReportSchedulesClient initialSchedules={(data ?? []) as any[]} />
    </div>
  )
}
