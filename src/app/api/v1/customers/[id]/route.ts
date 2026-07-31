import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { customerUpdateSchema } from '@/lib/schemas/customer'
import { guardDuplicateName, findDuplicateName } from '@/lib/utils/duplicateName'
import { guardDelete, CUSTOMER_DEPENDENTS } from '@/lib/utils/deleteGuard'

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

  const parsed = await parseBody(req, customerUpdateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  // Rename must not walk into an existing name. Create was the obvious hole,
  // but editing "Ags Molasses" to "AGS MOLASSES" produced exactly the same
  // unresolvable pair and nothing checked it at all. `excludeId` keeps a row
  // from being its own duplicate when the name is unchanged.
  if (body.name !== undefined) {
    const dupe = await guardDuplicateName(supabase, 'customer', {
      table: 'customers',
      companyId,
      name: body.name,
      codeColumn: 'customer_code',
      excludeId: params.id,
    })
    if (dupe) return dupe
  }

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
  if (credit_limit != null) patch.credit_limit = parseFloat(String(credit_limit))
  if (payment_terms != null) patch.payment_terms = parseInt(String(payment_terms))

  const { data, error } = await supabase.from('customers' as any).update(patch)
    .eq('id', params.id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'customers', 'delete', supabase)
  if (denied) return denied

  // Say what is attached before removing it. "Ags Molasses" was deleted with 4
  // jobs on it and nothing said a word. A warning rather than a block: a
  // customer entered by mistake, with a job entered by mistake, still has to be
  // removable — and this is a soft delete with a Restore tab behind it.
  if (new URL(req.url).searchParams.get('force') !== '1') {
    const blocked = await guardDelete(supabase, params.id, CUSTOMER_DEPENDENTS, 'customer')
    if (blocked) return blocked
  }

  const { error } = await supabase.from('customers' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', params.id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})

/**
 * Undo a soft delete. There was no way back from the UI at all — a mistaken
 * delete needed a hand-written database update, which is what "Ags Molasses"
 * and its 4 jobs cost.
 *
 * Uses the `edit` permission, not `delete`: putting a record back is a lesser
 * act than removing it, and gating restore behind `delete` would mean the
 * people most likely to notice the mistake are the ones who cannot fix it.
 */
export const POST = withErrorHandling(async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'customers', 'edit', supabase)
  if (denied) return denied

  const { data: row, error: readErr } = await supabase.from('customers' as any)
    .select('id, name, customer_code, deleted_at')
    .eq('id', params.id).eq('company_id', companyId).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  if (!(row as any).deleted_at) {
    return NextResponse.json({ error: 'This customer is not deleted.' }, { status: 400 })
  }

  // Restoring must not resurrect a name someone has since re-used, or we are
  // straight back to two "AGS Molasses" rows — the exact state this whole
  // change exists to prevent.
  //
  // Only LIVE rows count as a clash. findDuplicateName deliberately returns
  // soft-deleted matches too (so create can say "restore it instead"), but here
  // that would be backwards: the near-identical duplicate sitting in the
  // Deleted tab must not stop the real customer coming back.
  const clashes = (await findDuplicateName(supabase, {
    table: 'customers',
    companyId,
    name: (row as any).name,
    codeColumn: 'customer_code',
    excludeId: params.id,
  })).filter(h => h.deleted_at === null)

  if (clashes.length) {
    return NextResponse.json({
      error:
        `Cannot restore "${(row as any).name}" — a customer with that name already exists ` +
        `(${clashes[0].code ?? clashes[0].name}). Rename the existing one first, then restore this.`,
      duplicate_of: clashes[0],
      code: 'RESTORE_NAME_CLASH',
    }, { status: 409 })
  }

  const { data, error } = await supabase.from('customers' as any)
    .update({ deleted_at: null, is_active: true })
    .eq('id', params.id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, restored: true })
})
