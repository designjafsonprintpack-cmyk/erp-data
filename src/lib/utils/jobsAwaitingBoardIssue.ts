import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlannedDates } from './plannedDates'

export interface BoardIssueJob {
  job_id: string
  job_number: string
  job_title: string
  customer_name: string | null
  priority: string
  planned_date: string | null
  required_date: string | null
  gsm: number | null
  sheet_width_in: number | null
  sheet_height_in: number | null
  sheet_qty: number | null
  board_type_name: string | null
  /**
   * Stock ki wo row jis par is job ka board pehle se RESERVE hai (135), agar
   * hai. MRN banate waqt yehi pre-select hoti hai — warna storekeeper wohi
   * cheez 54 rows mein se haath se dhoondta hai jo system ko pehle se maloom
   * thi. Null ka matlab: is job ka board khareedna hai, stock mein nahi.
   */
  board_item_id: string | null
  /** 'pending' — nobody has started Board Issue yet; 'in_progress' — started. */
  stage_status: string
  /** The job's live MRN, if one exists. Null means Store hasn't got a paper yet. */
  mrn: { id: string; mrn_number: string; status: string } | null
}

/**
 * "Store ko kis job ka kaam karna hai" — every live job sitting at the Board
 * Issue stage, with the state of its material requisition attached.
 *
 * Board Issue is the one stage that is half automated already: starting it
 * auto-creates a draft MRN, and completing it is hard-blocked until that MRN is
 * 'issued'. But the Store page only ever listed MRNs, so a job whose stage had
 * started — or one waiting for its MRN to be raised at all — was invisible
 * unless someone went looking. This is that list.
 *
 * Board type / GSM / sheet qty come along because they are exactly what the
 * storekeeper needs in hand to pick the right lot.
 */
export async function loadJobsAwaitingBoardIssue(
  supabase: SupabaseClient,
  companyId: string
): Promise<BoardIssueJob[]> {
  const { data: stageRows } = await supabase.from('job_stage_progress' as any)
    .select('job_id, status, workflow_stages!inner(name, stage_type), jobs!inner(job_number, job_title, priority, required_date, gsm, sheet_width_in, sheet_height_in, sheet_qty, status, deleted_at, customers(name), board_types(name))')
    .eq('company_id', companyId)
    .in('status', ['pending', 'in_progress'])
    .eq('is_active', true)

  // Matches the stage the same way the workflow route's MRN automation does:
  // stage_type where it's set, name as the fallback for older templates.
  const candidates = ((stageRows ?? []) as any[]).filter(r => {
    if (!r.jobs || r.jobs.deleted_at) return false
    if (!['new', 'in_progress'].includes(r.jobs.status)) return false
    const type = r.workflow_stages?.stage_type
    const name = (r.workflow_stages?.name ?? '').trim().toLowerCase()
    return type === 'board_issue' || name === 'board issue'
  })

  if (candidates.length === 0) return []

  const jobIds = Array.from(new Set(candidates.map(r => r.job_id)))

  const [{ data: mrnRows }, { data: demandRows }, plannedDates] = await Promise.all([
    supabase.from('material_requisitions' as any)
      .select('id, mrn_number, status, job_id, created_at')
      .eq('company_id', companyId)
      .in('job_id', jobIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    // Sirf un demands ki stock row jinhon ne waqai stock pakra hua hai —
    // sheets_from_stock sifar ho to board khareeda ja raha hai aur pre-select
    // karne ko kuch hai hi nahi.
    supabase.from('board_demands' as any)
      .select('job_id, board_item_id, sheets_from_stock')
      .eq('company_id', companyId)
      .in('job_id', jobIds)
      .is('deleted_at', null)
      .neq('status', 'cancelled'),
    getPlannedDates(supabase, companyId, jobIds),
  ])

  const boardItemByJob = new Map<string, string>()
  for (const d of ((demandRows ?? []) as any[])) {
    if (d.board_item_id && Number(d.sheets_from_stock ?? 0) > 0) boardItemByJob.set(d.job_id, d.board_item_id)
  }

  // Newest MRN per job wins — a job is normally requisitioned once, and if it
  // was raised twice the latest is the one Store is working on.
  const mrnByJob = new Map<string, { id: string; mrn_number: string; status: string }>()
  for (const m of ((mrnRows ?? []) as any[])) {
    if (!mrnByJob.has(m.job_id)) {
      mrnByJob.set(m.job_id, { id: m.id, mrn_number: m.mrn_number, status: m.status })
    }
  }

  const rows: BoardIssueJob[] = candidates.map(r => ({
    job_id: r.job_id,
    job_number: r.jobs.job_number,
    job_title: r.jobs.job_title,
    customer_name: r.jobs.customers?.name ?? null,
    priority: r.jobs.priority,
    planned_date: plannedDates.get(r.job_id) ?? null,
    required_date: r.jobs.required_date ?? null,
    gsm: r.jobs.gsm ?? null,
    sheet_width_in: r.jobs.sheet_width_in ?? null,
    sheet_height_in: r.jobs.sheet_height_in ?? null,
    sheet_qty: r.jobs.sheet_qty ?? null,
    board_type_name: r.jobs.board_types?.name ?? null,
    board_item_id: boardItemByJob.get(r.job_id) ?? null,
    stage_status: r.status,
    mrn: mrnByJob.get(r.job_id) ?? null,
  }))

  // Whatever Store can act on right now comes first: an MRN already approved
  // and waiting to be issued, then one waiting for approval, then jobs with no
  // MRN at all; within each, nearest planned date first.
  const rank = (r: BoardIssueJob) => {
    const s = r.mrn?.status
    if (s === 'approved' || s === 'partially_issued') return 0
    if (s === 'pending') return 1
    if (!r.mrn) return 2
    return 3 // already issued — nothing left to do here
  }
  const key = (r: BoardIssueJob) => r.planned_date ?? r.required_date ?? '9999-12-31'
  rows.sort((a, b) => (rank(a) - rank(b)) || key(a).localeCompare(key(b)))

  return rows
}

export default loadJobsAwaitingBoardIssue
