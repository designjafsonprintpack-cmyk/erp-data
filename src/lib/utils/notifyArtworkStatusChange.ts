import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Notifications for artwork status changes — Designer/Sales/Production
 * triggers from the original Artwork Module spec. Takes an explicit
 * supabase client (rather than creating its own, the way notify() in
 * notificationService.ts does) because the public customer-approval route
 * has no authenticated session for a cookie-bound client to work under
 * RLS with — it passes its service-role admin client instead, which
 * bypasses RLS for what is a legitimate system-generated notification.
 *
 * Recipient rules (confirmed with Mehboob):
 *   - Changes Requested -> the job's assigned designer (jobs.artwork_by)
 *   - Approved -> the designer AND everyone in the 'Sales' department
 *   - Approved -> everyone in the 'Planning' department (stands in for
 *     "Production" — Planning is the next stage after Customer Approval
 *     in every workflow template, and there's no single modeled
 *     "Production" department/role in this schema)
 *
 * Only fires for these two statuses — Draft/Internal Review/Waiting
 * Customer Approval/Rejected/Archived transitions are silent by design
 * (matches the original spec's three named triggers, nothing more).
 */
export async function notifyArtworkStatusChange(
  supabase: SupabaseClient,
  params: { companyId: string; jobId: string; artworkVersion: number; newStatus: string }
): Promise<void> {
  const { companyId, jobId, artworkVersion, newStatus } = params
  if (!['changes_requested', 'approved'].includes(newStatus)) return

  const { data: job } = await supabase.from('jobs' as any)
    .select('job_number, job_title, artwork_by')
    .eq('id', jobId).eq('company_id', companyId).maybeSingle()
  if (!job) return
  const j = job as any

  const link = `/dashboard/artwork?job_id=${jobId}`
  const rows: Array<Record<string, any>> = []
  const seen = new Set<string>() // avoid double-notifying the same user (e.g. designer also in Sales)

  const push = (userId: string | null | undefined, title: string, message: string, type: 'success' | 'warning') => {
    if (!userId || seen.has(userId)) return
    seen.add(userId)
    rows.push({ company_id: companyId, user_id: userId, title, message, type, link_url: link })
  }

  const usersInDepartment = async (departmentName: string): Promise<string[]> => {
    const { data: dept } = await supabase.from('departments' as any)
      .select('id').eq('company_id', companyId).eq('name', departmentName).maybeSingle()
    if (!dept) return []
    const { data: users } = await supabase.from('users' as any)
      .select('id').eq('company_id', companyId).eq('department_id', (dept as any).id)
      .eq('is_active', true).is('deleted_at', null)
    return ((users ?? []) as any[]).map(u => u.id)
  }

  if (newStatus === 'changes_requested') {
    push(j.artwork_by, 'Changes requested on artwork',
      `${j.job_number} — ${j.job_title}: customer requested changes on artwork v${artworkVersion}.`, 'warning')
  }

  if (newStatus === 'approved') {
    push(j.artwork_by, 'Artwork approved',
      `${j.job_number} — ${j.job_title}: artwork v${artworkVersion} has been approved.`, 'success')

    for (const userId of await usersInDepartment('Sales')) {
      push(userId, 'Artwork approved',
        `${j.job_number} — ${j.job_title}: artwork v${artworkVersion} has been approved by the customer.`, 'success')
    }

    for (const userId of await usersInDepartment('Planning')) {
      push(userId, 'Artwork ready for production',
        `${j.job_number} — ${j.job_title}: artwork v${artworkVersion} is approved and ready to plan.`, 'success')
    }
  }

  if (rows.length) await supabase.from('notifications' as any).insert(rows)
}
