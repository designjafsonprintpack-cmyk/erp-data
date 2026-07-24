import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import PlatesClient from './PlatesClient'

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
    .limit(100)

  const { data: jobs } = await supabase
    .from('jobs' as any)
    .select('id,job_number,job_title,customers(name)')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('status', ['new', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(150)

  const { data: machines } = await supabase
    .from('machines' as any)
    .select('id,name,code,machine_type')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('machine_type', 'printing')
    .order('name')

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
  const currentJobByPlate: Record<string, { assignment_id: string; job_number: string; job_title: string } | null> = {}
  if (plateIds.length > 0) {
    const { data: activeAssignments } = await supabase
      .from('job_plates' as any)
      .select('id, plate_id, assigned_at, jobs(job_number, job_title)')
      .eq('company_id', companyId)
      .in('plate_id', plateIds)
      .is('deleted_at', null)
      .is('returned_at', null)
      .order('assigned_at', { ascending: false })

    for (const row of ((activeAssignments ?? []) as any[])) {
      // First one wins per plate_id since the query is already ordered
      // newest-first — later (older) duplicates for the same plate are
      // ignored rather than overwriting a newer one.
      if (!(row.plate_id in currentJobByPlate)) {
        currentJobByPlate[row.plate_id] = row.jobs
          ? { assignment_id: row.id, job_number: row.jobs.job_number, job_title: row.jobs.job_title }
          : null
      }
    }
  }

  const platesWithCurrentJob = (data ?? []).map((p: any) => ({
    ...p,
    current_job: currentJobByPlate[p.id] ?? null,
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Plates</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{count ?? 0} plates in registry</p>
      </div>
      <PlatesClient
        initialPlates={platesWithCurrentJob as any[]}
        jobs={(jobs ?? []) as any[]}
        machines={(machines ?? []) as any[]}
        colorSpecs={(colorSpecs ?? []) as any[]}
      />
    </div>
  )
}
