import { createSupabaseServerClient } from '@/lib/supabase/server'
import { LIST_PAGE_SIZE } from '@/lib/constants/pagination'
import { attachCurrentJob } from '@/lib/utils/platesWithCurrentJob'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import PlatesClient from './PlatesClient'
import { loadJobsNeedingPlates } from '@/lib/utils/jobsNeedingPlates'

export default async function PlatesPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // dashboard/layout.tsx already redirects unauthenticated requests to /login

  const companyId = await getCompanyId(user, supabase)

  const { data, count } = await supabase
    .from('plates' as any)
    .select('*, origin_job:jobs!plates_origin_job_id_fkey(job_number,job_title)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    // First page only — PlatesClient pages the rest from /api/v1/plates, which
    // now applies the search, the status and the job filter server-side.
    .order('id', { ascending: false })
    .range(0, LIST_PAGE_SIZE - 1)

  const { data: jobs } = await supabase
    .from('jobs' as any)
    .select('id,job_number,job_title,customers(name)')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('status', ['new', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(150)

  // Which jobs are about to need plates — printing is hard-blocked without
  // them, so this is the plate room's actual work list. Replaces the old
  // "machines" fetch, which only fed a dropdown nobody wanted on the form.
  const jobsNeedingPlates = await loadJobsNeedingPlates(supabase, companyId)

  const { data: colorSpecs } = await supabase
    .from('color_specs' as any)
    .select('id,name')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name')

  // Which job is each plate CURRENTLY with — the real answer to "kis job ki
  // hai", distinct from origin_job (which only ever shows the job the plate
  // was originally made for, and goes stale the moment a plate is reused on
  // a different job). "Currently with" = the job_plates assignment row for
  // this plate that hasn't been returned yet (returned_at IS NULL). A plate
  // can only sensibly be actively assigned to one job at a time, but if data
  // is ever inconsistent (e.g. an old row never got a returned_at before
  // this convention existed), the most recently assigned row wins.
  const plateIds = (data ?? []).map((p: any) => p.id)
  const platesWithCurrentJob = await attachCurrentJob(supabase, companyId, (data ?? []) as any[])

  // Two things the client can no longer derive from its own rows once the list
  // is paged: every in-storage plate (the "reuse an existing plate" dropdown)
  // and every job number that currently holds a plate (the job filter).
  const { data: reusable } = await supabase
    .from('plates' as any)
    .select('id,plate_code,color,plate_size,status,reuse_count')
    .eq('company_id', companyId).is('deleted_at', null).eq('is_active', true)
    .eq('status', 'in_storage').order('plate_code')

  const { data: openAssignments } = await supabase
    .from('job_plates' as any)
    .select('jobs(job_number)')
    .eq('company_id', companyId).is('deleted_at', null).is('returned_at', null)
  const platedJobNumbers = Array.from(new Set(
    ((openAssignments ?? []) as any[]).map(r => r.jobs?.job_number).filter(Boolean)
  )).sort()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Plates</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{count ?? 0} plates in registry</p>
      </div>
      <PlatesClient
        initialPlates={platesWithCurrentJob as any[]}
        initialTotal={count ?? 0}
        reusablePlates={(reusable ?? []) as any[]}
        platedJobNumbers={platedJobNumbers}
        jobs={(jobs ?? []) as any[]}
        jobsNeedingPlates={jobsNeedingPlates}
        colorSpecs={(colorSpecs ?? []) as any[]}
      />
    </div>
  )
}
