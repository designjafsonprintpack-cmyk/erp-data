import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { systemSettingsSchema } from '@/lib/schemas/adminUser'
import { SESSION_TIMEOUT_KEY, isValidSessionTimeout } from '@/config/sessionTimeout'

export const GET = withErrorHandling(async function GET(_req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('system_settings' as any)
    .select('key,value,category,description')
    .order('category').order('key')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const map: Record<string, string> = {}
  ;(data ?? []).forEach((r: any) => { map[r.key] = r.value ?? '' })
  return NextResponse.json({ data: data ?? [], map })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'edit', supabase)
  if (denied) return denied
  const parsed = await parseBody(req, systemSettingsSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  // Reject an invalid session-timeout value explicitly rather than letting
  // it silently save as free text — IdleTimeoutGuard falls back to the
  // default for anything it doesn't recognize, but a bad value stored here
  // would look "saved" in the UI while quietly not doing what was picked.
  if (SESSION_TIMEOUT_KEY in body && !isValidSessionTimeout(body[SESSION_TIMEOUT_KEY])) {
    return NextResponse.json(
      { error: `Invalid ${SESSION_TIMEOUT_KEY} value. Must be 15, 30, 60, 120, 240, or 'never'.` },
      { status: 400 }
    )
  }

  const updates = Object.entries(body).map(([key, value]) => ({
    company_id: companyId,
    key,
    value: String(value),
  }))

  const { error } = await supabase.from('system_settings' as any)
    .upsert(updates, { onConflict: 'company_id,key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, updated: updates.length })
})
