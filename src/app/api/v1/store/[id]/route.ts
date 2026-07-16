import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const body = await req.json()

  // Approve action
  if (body.action === 'approve') {
    const { data, error } = await supabase.from('material_requisitions' as any)
      .update({ status: 'approved', approved_by: user.id }).eq('id', params.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // Issue items action — update issued quantities
  if (body.action === 'issue' && body.items) {
    for (const item of body.items) {
      await supabase.from('material_requisition_items' as any)
        .update({ quantity_issued: parseFloat(item.quantity_issued || '0') })
        .eq('id', item.id)
    }

    // Recalculate MRN status
    const { data: allItems } = await supabase.from('material_requisition_items' as any)
      .select('quantity_required, quantity_issued').eq('requisition_id', params.id)

    const items = (allItems ?? []) as any[]
    const allIssued = items.every(i => i.quantity_issued >= i.quantity_required)
    const anyIssued = items.some(i => i.quantity_issued > 0)
    const newStatus = allIssued ? 'issued' : anyIssued ? 'partially_issued' : 'approved'

    const { data, error } = await supabase.from('material_requisitions' as any)
      .update({ status: newStatus }).eq('id', params.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // Generic PATCH
  const { data, error } = await supabase.from('material_requisitions' as any)
    .update(body).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
