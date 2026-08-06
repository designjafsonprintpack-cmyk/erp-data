import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlannedDates } from './plannedDates'
import { getProductionStage, stageMatchesSlug } from './productionStages'
import { loadFamilyPlates, type ReusablePlate } from './familyPlates'

export interface JobNeedingPlates {
  job_id: string
  job_number: string
  job_title: string
  customer_name: string | null
  no_of_colors: number | null
  priority: string
  planned_date: string | null
  required_date: string | null
  /** 'pending' — printing hasn't started; 'in_progress' — it's already running. */
  printing_status: string
  /**
   * Isi carton ke pichle run ki plates jo dobara lag sakti hain. Repeat par
   * hi bhari hoti hai — naye carton ki koi purani plate hoti hi nahi.
   */
  reusable_plates?: ReusablePlate[]
}

/**
 * "Kis job ko plate chahiye" — every live job whose Printing stage is still
 * pending or in progress and which has NO plate currently issued to it.
 *
 * Why this exists: printing is hard-blocked without an active job_plates row
 * (see /api/v1/jobs/[id]/workflow), but nothing ever told the plate room which
 * jobs were about to hit that wall. The Plates page listed plates and offered a
 * dropdown of 150 jobs — the operator had to already know the answer. This
 * turns it around: the page shows the work, and adding plates starts from a job.
 *
 * A job with plates already issued (job_plates row with returned_at IS NULL)
 * drops off the list by itself, so nothing has to be ticked off.
 */
export async function loadJobsNeedingPlates(
  supabase: SupabaseClient,
  companyId: string
): Promise<JobNeedingPlates[]> {
  const printing = getProductionStage('printing')
  if (!printing) return []

  const { data: stageRows } = await supabase.from('job_stage_progress' as any)
    .select('job_id, status, workflow_stages!inner(name), jobs!inner(job_number, job_title, priority, no_of_colors, required_date, status, deleted_at, customers(name))')
    .eq('company_id', companyId)
    .in('status', ['pending', 'in_progress'])
    .eq('is_active', true)

  const candidates = ((stageRows ?? []) as any[]).filter(r =>
    r.jobs &&
    !r.jobs.deleted_at &&
    ['new', 'in_progress'].includes(r.jobs.status) &&
    stageMatchesSlug(r.workflow_stages?.name ?? '', printing)
  )

  if (candidates.length === 0) return []

  const jobIds = Array.from(new Set(candidates.map(r => r.job_id)))

  // Plates currently out with these jobs — those jobs are already sorted.
  const { data: activePlates } = await supabase.from('job_plates' as any)
    .select('job_id')
    .eq('company_id', companyId)
    .in('job_id', jobIds)
    .is('deleted_at', null)
    .is('returned_at', null)

  const hasPlates = new Set(((activePlates ?? []) as any[]).map(r => r.job_id))
  const pending = candidates.filter(r => !hasPlates.has(r.job_id))
  if (pending.length === 0) return []

  const plannedDates = await getPlannedDates(supabase, companyId, pending.map(r => r.job_id))

  const rows: JobNeedingPlates[] = pending.map(r => ({
    job_id: r.job_id,
    job_number: r.jobs.job_number,
    job_title: r.jobs.job_title,
    customer_name: r.jobs.customers?.name ?? null,
    no_of_colors: r.jobs.no_of_colors ?? null,
    priority: r.jobs.priority,
    planned_date: plannedDates.get(r.job_id) ?? null,
    required_date: r.jobs.required_date ?? null,
    printing_status: r.status,
  }))

  // Repeat par is carton ki purani plates — ek query poori list ke liye, har
  // row par alag nahi. Nakaam ho to list phir bhi aati hai, bas reuse ka button
  // nahi dikhta: plate room ka kaam ki fehrist is se zyada ahem hai.
  const family = await loadFamilyPlates(supabase, companyId,
    rows.map(r => ({ job_id: r.job_id, job_number: r.job_number })))
  for (const r of rows) {
    const list = family[r.job_id]
    if (list?.length) r.reusable_plates = list
  }

  // Most urgent first: printing already running (the press is waiting), then
  // by planned date, then by required date. Undated jobs sort last.
  const key = (r: JobNeedingPlates) => r.planned_date ?? r.required_date ?? '9999-12-31'
  rows.sort((a, b) => {
    if (a.printing_status !== b.printing_status) return a.printing_status === 'in_progress' ? -1 : 1
    return key(a).localeCompare(key(b))
  })

  return rows
}

export default loadJobsNeedingPlates
