/**
 * Attach each plate's CURRENT job — the open `job_plates` assignment — to the
 * plate row.
 *
 * A plate's `origin_job` is the job it was made for and never changes; the job
 * it is mounted on right now is a different fact, and it is what the Plates
 * page groups by. This lived only inside the Plates server component, so the
 * `/api/v1/plates` route returned rows without it — which meant the page could
 * not be paged from the API without losing its grouping.
 *
 * Extracted so both read the same enrichment, rather than the API growing a
 * second, drifting copy.
 */
export type PlateCurrentJob = {
  assignment_id: string
  job_number: string
  job_title: string
} | null

export async function attachCurrentJob(
  supabase: any,
  companyId: string,
  plates: any[]
): Promise<any[]> {
  const plateIds = plates.map(p => p.id)
  if (plateIds.length === 0) return plates

  const { data: activeAssignments } = await supabase
    .from('job_plates' as any)
    .select('id, plate_id, assigned_at, jobs(job_number, job_title)')
    .eq('company_id', companyId)
    .in('plate_id', plateIds)
    .is('deleted_at', null)
    .is('returned_at', null)
    .order('assigned_at', { ascending: false })

  const byPlate: Record<string, PlateCurrentJob> = {}
  for (const row of ((activeAssignments ?? []) as any[])) {
    // First one wins per plate_id since the query is already ordered
    // newest-first — later (older) duplicates for the same plate are ignored
    // rather than overwriting a newer one.
    if (!(row.plate_id in byPlate)) {
      byPlate[row.plate_id] = row.jobs
        ? { assignment_id: row.id, job_number: row.jobs.job_number, job_title: row.jobs.job_title }
        : null
    }
  }

  return plates.map(p => ({ ...p, current_job: byPlate[p.id] ?? null }))
}

export default attachCurrentJob
