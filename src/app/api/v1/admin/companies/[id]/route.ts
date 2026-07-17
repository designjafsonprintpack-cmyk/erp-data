import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'

export async function GET(_req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('system_settings' as any)
    .select('key,value,category,description')
    .order('category').order('key')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return as key→value map for easy client use
  const map: Record<string, string> = {}
  const full = (data ?? []) as any[]
  full.forEach(row => { map[row.key] = row.value ?? '' })

  return NextResponse.json({ data: full, map })
}

export async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'edit', supabase)
  if (denied) return denied

  const body = await req.json() // { key: value, key: value, ... }

  const updates = Object.entries(body).map(([key, value]) => ({
    company_id: companyId,
    key,
    value:      String(value),
    updated_by: userTableId,
  }))

  const { error } = await supabase.from('system_settings' as any)
    .upsert(updates, { onConflict: 'company_id,key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, updated: updates.length })
}
