import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { plateReplaceSchema } from '@/lib/schemas/plate'

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'plates', 'create', supabase)
  if (denied) return denied

  // Tolerates a missing/empty body (reason is optional) — validates the
  // same schema manually instead of via parseBody, since parseBody's
  // hard-400-on-unparseable-JSON behavior would be a regression for a
  // caller that sends no body at all.
  const rawBody = await req.json().catch(() => ({}))
  const bodyResult = plateReplaceSchema.safeParse(rawBody)
  if (!bodyResult.success) {
    return NextResponse.json({ error: 'Validation failed', fieldErrors: bodyResult.error.flatten().fieldErrors }, { status: 400 })
  }
  const body = bodyResult.data

  const { data: newPlateId, error } = await (supabase as any).rpc('replace_plate', {
    p_plate_id: params.id,
    p_company_id: companyId,
    p_reason: body.reason || null,
    p_created_by: userTableId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { data: newPlate } = await supabase.from('plates' as any)
    .select('*').eq('id', newPlateId).eq('company_id', companyId).single()

  return NextResponse.json({ data: newPlate })
})
