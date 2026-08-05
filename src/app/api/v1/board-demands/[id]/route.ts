import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { boardDemandUpdateSchema } from '@/lib/schemas/boardDemand'
import { DEMAND_SELECT, decorateDemands } from '@/lib/utils/boardDemandQuery'

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'purchase', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, boardDemandUpdateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const { data: current } = await supabase.from('board_demands' as any)
    .select('id, job_id, sheets_ordered, sheets_received')
    .eq('id', params.id).eq('company_id', companyId).is('deleted_at', null).maybeSingle()
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cur = current as any

  if (body.action === 'cancel') {
    // Jis board ka order ja chuka hai ya jo aa chuka hai, uski demand band karna
    // ek jhoot hai — maal phir bhi aayega aur uska koi khata nahi rahega. PO
    // pehle cancel karni hogi.
    if (Number(cur.sheets_ordered) > 0 || Number(cur.sheets_received) > 0) {
      return NextResponse.json({
        error: 'This demand already has board on order or received — cancel the purchase order first.',
      }, { status: 400 })
    }
    if (cur.job_id) {
      const { error } = await (supabase as any).rpc('release_board_demand', {
        p_company_id: companyId, p_job_id: cur.job_id, p_user_id: userTableId,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      // Forecast demand ka koi job nahi, is liye release_board_demand (jo job se
      // dhoondta hai) is par nahi chal sakta.
      const { error } = await supabase.from('board_demands' as any)
        .update({ status: 'cancelled', sheets_from_stock: 0, sheets_to_purchase: 0, updated_by: userTableId })
        .eq('id', params.id).eq('company_id', companyId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  const patch: Record<string, any> = { updated_by: userTableId }
  if (body.notes !== undefined) patch.notes = body.notes || null
  if (body.sheets_required !== undefined) patch.sheets_required = Number(body.sheets_required)

  const { error } = await supabase.from('board_demands' as any)
    .update(patch).eq('id', params.id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Maqdaar badli to reservation aur to_purchase dono dobara nikalne parenge.
  // Job wali demand poori tarah resolve hoti hai (stock ka hissa bhi badal
  // sakta hai); forecast wali ka sirf hisab.
  if (body.sheets_required !== undefined) {
    if (cur.job_id) {
      const { error: rErr } = await (supabase as any).rpc('resolve_board_demand', {
        p_company_id: companyId, p_job_id: cur.job_id,
        p_sheets_required: Number(body.sheets_required), p_user_id: userTableId,
      })
      if (rErr) console.error('[board-demands] resolve failed', rErr)
    } else {
      const { error: rErr } = await (supabase as any).rpc('recalc_board_demand', { p_demand_id: params.id })
      if (rErr) console.error('[board-demands] recalc failed', rErr)
    }
  }

  const { data: fresh } = await supabase.from('board_demands' as any)
    .select(DEMAND_SELECT).eq('id', params.id).eq('company_id', companyId).single()
  const [row] = await decorateDemands(supabase, companyId, [fresh as any])
  return NextResponse.json({ data: row })
})
