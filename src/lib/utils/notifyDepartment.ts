import type { SupabaseClient } from '@supabase/supabase-js'
import { notify } from '@/modules/notifications/services/notificationService'
import { sendWhatsApp } from './sendWhatsApp'

interface NotifyDepartmentParams {
  companyId: string
  departmentId: string | null
  title: string
  message: string
  linkUrl?: string
  groupKey?: string
}

/**
 * Notifies every active user assigned to a department — in-app (always,
 * per Mehboob's channel choice) and WhatsApp (best-effort — silently does
 * nothing for a user with no phone number on file, and sendWhatsApp itself
 * silently no-ops if WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN aren't
 * configured, same as every other WhatsApp send in this app).
 *
 * `departmentId` comes from workflow_stages.department_id — that column
 * already existed (Settings > Workflow Engine already lets Mehboob assign
 * a department per stage) but was never required to be set. If a stage has
 * no department assigned yet, this is a deliberate no-op rather than a
 * guess at who should be notified — nothing fires until Mehboob assigns
 * departments to the relevant stages (Printing, Die Cutting, Plates/Store,
 * etc.) in that existing screen.
 *
 * Always pass an explicit `supabase` client — this is called from both
 * normal authenticated routes and the cron reminder route, and the caller
 * knows which it has. Passing an admin/service-role client is required for
 * cron contexts (see notify()'s own doc comment for why).
 */
export async function notifyDepartment(
  supabase: SupabaseClient,
  params: NotifyDepartmentParams
): Promise<{ notified: number }> {
  if (!params.departmentId) return { notified: 0 }

  const { data: users } = await supabase.from('users' as any)
    .select('id, phone')
    .eq('company_id', params.companyId)
    .eq('department_id', params.departmentId)
    .is('deleted_at', null)
    .eq('is_active', true)

  const recipients = (users ?? []) as any[]

  for (const u of recipients) {
    await notify({
      user_id: u.id, company_id: params.companyId,
      title: params.title, message: params.message,
      type: 'info', link_url: params.linkUrl,
      group_key: params.groupKey, digest_window_minutes: 60,
    }, supabase).catch(() => null)

    if (u.phone) {
      await sendWhatsApp(u.phone, `${params.title}\n${params.message}`).catch(() => null)
    }
  }

  return { notified: recipients.length }
}
