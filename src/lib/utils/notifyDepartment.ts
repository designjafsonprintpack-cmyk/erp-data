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
): Promise<{ notified: number; fallback: boolean }> {
  if (!params.departmentId) return { notified: 0, fallback: false }

  // EK AADMI KAI DEPARTMENT DEKHTA HAI (146). Mehboob: *"aik shaks 2 ya 3
  // depart ko dakh raha hay."* Is liye rukniyat `user_departments` se parhi
  // jati hai, `users.department_id` se nahi — wo sirf uska ASAL department hai.
  // Dono ka MILAP liya jata hai: 146 ne purane primary department backfill kar
  // diye the, magar koi purana raasta sirf `department_id` likh de to us aadmi
  // ki ittila gum nahi honi chahiye.
  const [{ data: linked }, { data: primary }] = await Promise.all([
    supabase.from('user_departments' as any)
      .select('users!inner(id, phone, is_active, deleted_at, company_id)')
      .eq('company_id', params.companyId)
      .eq('department_id', params.departmentId)
      .is('deleted_at', null),
    supabase.from('users' as any)
      .select('id, phone')
      .eq('company_id', params.companyId)
      .eq('department_id', params.departmentId)
      .is('deleted_at', null)
      .eq('is_active', true),
  ])

  const byId = new Map<string, any>()
  for (const row of ((linked ?? []) as any[])) {
    const u = row.users
    if (u && u.is_active && !u.deleted_at) byId.set(u.id, { id: u.id, phone: u.phone })
  }
  for (const u of ((primary ?? []) as any[])) byId.set(u.id, u)

  let recipients = Array.from(byId.values())
  let fallback = false
  let prefix = ''

  // ─── KHALI DEPARTMENT ki ittila zaya nahi honi chahiye ────────────────────
  // Live par 14 mein se 8 department bilkul khali hain — Planning, Printing,
  // Packing, Dispatch, Plates, Lamination, Hot Foil, Folder Gluing. Pehle ye
  // function aise mein khamoshi se 0 wapas kar deta tha, yani "agle department
  // ko khud ittila" wala poora feature un tamam stages par kuch bhejta hi nahi
  // tha aur kisi ko pata bhi nahi chalta tha. Yehi wajah hai ke 9 jobs Planning
  // par khaRi reh gayin.
  //
  // Ab ittila FLOOR CHALANE WALON tak jati hai — `production_manager` (CLAUDE.md
  // §4: "the man who runs the floor"), aur wo bhi na ho to GM / CEO / owner tak.
  // Ye department bharne ka mutabadil NAHI hai: paighaam mein saaf likha jata
  // hai ke ye kis khali department ka kaam hai, taake wo aadmi wahan koi lagaye.
  if (recipients.length === 0) {
    const { data: dept } = await supabase.from('departments' as any)
      .select('name').eq('id', params.departmentId).maybeSingle()
    const deptName = (dept as any)?.name || 'department'

    for (const roles of [['production_manager'], ['gm', 'ceo', 'owner']]) {
      const { data: standIn } = await supabase.from('users' as any)
        .select('id, phone')
        .eq('company_id', params.companyId)
        .in('role', roles)
        .is('deleted_at', null)
        .eq('is_active', true)
      if ((standIn ?? []).length > 0) {
        recipients = standIn as any[]
        fallback = true
        prefix = `[${deptName} department mein koi nahi] `
        break
      }
    }
  }

  for (const u of recipients) {
    await notify({
      user_id: u.id, company_id: params.companyId,
      title: params.title, message: `${prefix}${params.message}`,
      type: 'info', link_url: params.linkUrl,
      group_key: params.groupKey, digest_window_minutes: 60,
    }, supabase).catch(() => null)

    if (u.phone) {
      await sendWhatsApp(u.phone, `${params.title}\n${prefix}${params.message}`).catch(() => null)
    }
  }

  return { notified: recipients.length, fallback }
}
