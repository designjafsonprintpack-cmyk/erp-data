import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const [customerRes, contactsRes, addressesRes] = await Promise.all([
    supabase.from('customers' as any).select('*').eq('id', params.id).eq('company_id', companyId).single(),
    supabase.from('customer_contacts' as any).select('*').eq('customer_id', params.id).is('deleted_at', null).order('is_primary', { ascending: false }),
    supabase.from('customer_addresses' as any).select('*').eq('customer_id', params.id).is('deleted_at', null),
  ])

  if (customerRes.error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ customer: customerRes.data, contacts: contactsRes.data ?? [], addresses: addressesRes.data ?? [] })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'customers', 'edit', supabase)
  if (denied) return denied

  const body = await req.json()
  // Explicit allowlist — never spread raw body into update (mass-assignment risk:
  // company_id/id/deleted_at/is_active/created_by must not be client-settable).
  const {
    name, customer_code, email, phone, mobile, ntn, address, city,
    pipeline_stage, credit_limit, payment_terms, notes, contact_person, lead_source,
  } = body
  const patch: Record<string, any> = {}
  if (name !== undefined) patch.name = name
  if (customer_code !== undefined) patch.customer_code = customer_code
  if (email !== undefined) patch.email = email
  if (phone !== undefined) patch.phone = phone
  if (mobile !== undefined) patch.mobile = mobile
  if (ntn !== undefined) patch.ntn = ntn
  if (address !== undefined) patch.address = address
  if (city !== undefined) patch.city = city
  if (pipeline_stage !== undefined) patch.pipeline_stage = pipeline_stage
  if (notes !== undefined) patch.notes = notes
  if (contact_person !== undefined) patch.contact_person = contact_person
  if (lead_source !== undefined) patch.lead_source = lead_source
  if (credit_limit != null) patch.credit_limit = parseFloat(credit_limit)
  if (payment_terms != null) patch.payment_terms = parseInt(payment_terms)

  const { data, error } = await supabase.from('customers' as any).update(patch)
    .eq('id', params.id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'customers', 'delete', supabase)
  if (denied) return denied

  const { error } = await supabase.from('customers' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', params.id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
