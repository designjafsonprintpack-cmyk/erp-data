import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'plates', 'create', supabase)
  if (denied) return denied

  const body = await req.json().catch(() => ({}))

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
