import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(_req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)

  // Machine floor status view
  const { data: machines, error: mErr } = await supabase
    .from('machine_floor_status' as any)
    .select('*')
    .eq('company_id', companyId)
    .order('machine_name')

  // Today's completed assignments
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: todayDone } = await supabase
    .from('production_assignments' as any)
    .select('id, job_id, machine_id, actual_start, actual_end, actual_minutes, jobs(job_number,job_title), machines(name)')
    .eq('company_id', companyId)
    .eq('status', 'completed')
    .gte('actual_end', today.toISOString())
    .is('deleted_at', null)
    .order('actual_end', { ascending: false })
    .limit(20)

  // Jobs queued for production (assigned but not started)
  const { data: queued } = await supabase
    .from('production_assignments' as any)
    .select('*, jobs(job_number,job_title,priority,required_date,customers(name)), machines(name,machine_type)')
    .eq('company_id', companyId)
    .eq('status', 'queued')
    .is('deleted_at', null)
    .order('scheduled_start')
    .limit(20)

  // Summary stats
  const { count: activeCount } = await supabase
    .from('production_assignments' as any)
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'running')
    .is('deleted_at', null)

  const { count: queueCount } = await supabase
    .from('production_assignments' as any)
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'queued')
    .is('deleted_at', null)

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  return NextResponse.json({
    machines: machines ?? [],
    todayCompleted: todayDone ?? [],
    queued: queued ?? [],
    stats: {
      active: activeCount ?? 0,
      queued: queueCount ?? 0,
      completedToday: todayDone?.length ?? 0,
    }
  })
})
