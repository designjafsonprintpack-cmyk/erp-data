import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { notFound } from 'next/navigation'
import JobDetailClient from './JobDetailClient'

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // dashboard/layout.tsx already redirects unauthenticated requests to /login

  const companyId = await getCompanyId(user, supabase)

  const [jobRes, stagesRes, eventsRes, delayReasonsRes, wastageReasonsRes, machinesRes, wastageRes, artworksRes] = await Promise.all([
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
    supabase.from('wastage_reasons' as any)
      .select('id,name,category').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('machines' as any)
      .select('id,name').eq('company_id', companyId).eq('is_active', true).order('name'),
    supabase.from('job_wastage' as any)
      .select('*, wastage_reasons(name,category), machines(name), users(full_name)')
      .eq('job_id', params.id).is('deleted_at', null).order('occurred_at', { ascending: false }),
    supabase.from('job_artworks' as any)
      .select('*').eq('job_id', params.id).eq('company_id', companyId).is('deleted_at', null)
      .order('version', { ascending: false }),
  ])

  if (!jobRes.data) notFound()

  return (
    <JobDetailClient
      job={jobRes.data as any}
      stages={(stagesRes.data ?? []) as any[]}
      events={(eventsRes.data ?? []) as any[]}
      delayReasons={(delayReasonsRes.data ?? []) as any[]}
      wastageReasons={(wastageReasonsRes.data ?? []) as any[]}
      machines={(machinesRes.data ?? []) as any[]}
      wastageEntries={(wastageRes.data ?? []) as any[]}
      companyId={companyId}
      artworks={(artworksRes.data ?? []) as any[]}
    />
  )
}
