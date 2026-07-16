import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [customerRes, contactsRes, addressesRes] = await Promise.all([
    supabase.from('customers' as any).select('*').eq('id', params.id).single(),
    supabase.from('customer_contacts' as any).select('*').eq('customer_id', params.id).is('deleted_at', null).order('is_primary', { ascending: false }),
    supabase.from('customer_addresses' as any).select('*').eq('customer_id', params.id).is('deleted_at', null),
  ])

  if (customerRes.error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ customer: customerRes.data, contacts: contactsRes.data ?? [], addresses: addressesRes.data ?? [] })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { data, error } = await supabase.from('customers' as any).update({
    ...body,
    credit_limit: body.credit_limit != null ? parseFloat(body.credit_limit) : undefined,
    payment_terms: body.payment_terms != null ? parseInt(body.payment_terms) : undefined,
  }).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await supabase.from('customers' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
