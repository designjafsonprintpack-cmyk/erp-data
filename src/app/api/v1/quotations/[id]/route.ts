import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'

// Allowed quotation status transitions. 'converted' is intentionally excluded
// as a target here — it can only be reached via the dedicated /convert
// endpoint, which also creates the linked Sales Order. Allowing a direct
// PATCH to 'converted' would mark a quotation converted with no SO behind it.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft:     ['sent'],
  sent:      ['approved', 'rejected', 'expired', 'draft'],
  approved:  ['expired'],
  rejected:  ['sent', 'draft'],
  expired:   ['sent', 'draft'],
  converted: [],
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const { data, error } = await supabase.from('quotations' as any)
    .select('*, customers(name, customer_code, email, phone), quotation_items(*)')
    .eq('id', params.id).eq('company_id', companyId).single()
  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const result = { ...data, quotation_items: Array.isArray((data as any).quotation_items)
    ? [...(data as any).quotation_items].sort((a: any, b: any) => a.sort_order - b.sort_order) : [] }
  return NextResponse.json({ data: result })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'quotations', 'edit', supabase)
  if (denied) return denied

  const body = await req.json()

  if (body.status !== undefined) {
    if (body.status === 'converted') {
      return NextResponse.json(
        { error: 'A quotation cannot be marked converted directly — use the Convert to Sales Order action instead.' },
        { status: 400 }
      )
    }

    const { data: current, error: currentErr } = await supabase.from('quotations' as any)
      .select('status').eq('id', params.id).eq('company_id', companyId).single()
    if (currentErr || !current) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })

    const currentStatus = (current as any).status as string
    if (currentStatus !== body.status) {
      const allowed = ALLOWED_TRANSITIONS[currentStatus] || []
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          { error: `Cannot move quotation from "${currentStatus}" to "${body.status}".` +
                   (allowed.length ? ` Allowed next status(es): ${allowed.join(', ')}.` : ' This status is final.') },
          { status: 400 }
        )
      }
    }
  }

  const { data, error } = await supabase.from('quotations' as any).update(body)
    .eq('id', params.id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'quotations', 'delete', supabase)
  if (denied) return denied

  await supabase.from('quotations' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', params.id).eq('company_id', companyId)
  return NextResponse.json({ success: true })
}
