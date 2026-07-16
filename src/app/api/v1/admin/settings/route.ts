import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'

export async function GET(_req: NextRequest) {
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
}

export async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const body = await req.json()

  const updates = Object.entries(body).map(([key, value]) => ({
    company_id: companyId,
    key,
    value: String(value),
  }))

  const { error } = await supabase.from('system_settings' as any)
    .upsert(updates, { onConflict: 'company_id,key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, updated: updates.length })
}
