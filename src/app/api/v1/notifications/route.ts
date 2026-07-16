import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await supabase.from('notifications' as any).select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(50)
  return NextResponse.json({ data: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  if (body.all) {
    await supabase.from('notifications' as any).update({ is_read: true }).eq('is_read', false)
  } else if (body.id) {
    await supabase.from('notifications' as any).update({ is_read: true }).eq('id', body.id)
  }
  return NextResponse.json({ success: true })
}
