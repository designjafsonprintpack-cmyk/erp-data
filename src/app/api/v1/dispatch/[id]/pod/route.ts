import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { podSchema } from '@/lib/schemas/dispatch'
import { deliverWebhook } from '@/lib/utils/deliverWebhook'

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'dispatch', 'edit', supabase)
  if (denied) return denied
  const parsed = await parseBody(req, podSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  // Upsert POD
  const { data, error } = await supabase.from('proof_of_delivery' as any).upsert({
    company_id:    companyId,
    dispatch_id:   params.id,
    received_by:   body.received_by,
    received_at:   body.received_at || new Date().toISOString(),
    signature_url: body.signature_url || null,
    photo_url:     body.photo_url || null,
    condition:     body.condition || 'good',
    damage_notes:  body.damage_notes || null,
    confirmed_by:  userTableId,
    notes:         body.notes || null,
  }, { onConflict: 'company_id,dispatch_id' }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-mark dispatch as delivered
  const { data: dispatchRow } = await supabase.from('dispatch_orders' as any).update({
    status:       'delivered',
    delivered_at: new Date().toISOString(),
  }).eq('id', params.id).eq('company_id', companyId).eq('status', 'dispatched')
    .select('id, dispatch_number, customer_id').maybeSingle()

  if (dispatchRow) {
    // Non-blocking — a webhook failure must never affect the POD confirmation itself
    deliverWebhook(supabase, companyId, 'dispatch.delivered', {
      dispatch_id: (dispatchRow as any).id,
      dispatch_number: (dispatchRow as any).dispatch_number,
      customer_id: (dispatchRow as any).customer_id,
      received_by: body.received_by,
      condition: body.condition || 'good',
      delivered_at: new Date().toISOString(),
    }).catch(() => {})
  }

  return NextResponse.json({ data })
})
