import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { notFound } from 'next/navigation'
import JobDetailClient from './JobDetailClient'

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [jobRes, stagesRes, eventsRes, delayReasonsRes] = await Promise.all([
    supabase.from('jobs' as any)
      .select('*, customers(name,customer_code,email,phone,mobile), workflow_templates(name), sales_orders(so_number)')
      .eq('id', params.id).maybeSingle(),
    supabase.from('job_stage_progress' as any)
      .select('*, workflow_stages(name,is_optional,estimated_hours)')
      .eq('job_id', params.id).order('sequence_order'),
    supabase.from('job_stage_events' as any)
      .select('*, users(full_name)')
      .eq('job_id', params.id)
      .order('occurred_at', { ascending: false })
      .limit(50),
    supabase.from('delay_reasons' as any)
      .select('id,name,category').eq('company_id', companyId).is('deleted_at', null).order('name'),
  ])

  if (!jobRes.data) notFound()

  return (
    <JobDetailClient
      job={jobRes.data as any}
      stages={(stagesRes.data ?? []) as any[]}
      events={(eventsRes.data ?? []) as any[]}
      delayReasons={(delayReasonsRes.data ?? []) as any[]}
    />
  )
}
