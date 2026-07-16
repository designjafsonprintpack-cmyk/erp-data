import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('quotations' as any)
    .select('*, customers(name, customer_code, email, phone), quotation_items(*)')
    .eq('id', params.id).single()
  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const result = { ...data, quotation_items: Array.isArray((data as any).quotation_items)
    ? [...(data as any).quotation_items].sort((a: any, b: any) => a.sort_order - b.sort_order) : [] }
  return NextResponse.json({ data: result })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { data, error } = await supabase.from('quotations' as any).update(body).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await supabase.from('quotations' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', params.id)
  return NextResponse.json({ success: true })
}
