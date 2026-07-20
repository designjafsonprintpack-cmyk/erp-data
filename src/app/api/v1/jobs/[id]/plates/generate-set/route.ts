import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const POST = withErrorHandling(async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'plates', 'create', supabase)
  if (denied) return denied

  const { data: setId, error } = await (supabase as any).rpc('generate_plate_set', {
    p_job_id: params.id,
    p_company_id: companyId,
    p_created_by: userTableId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { data: set } = await supabase.from('plate_sets' as any)
    .select('*, plates(*)')
    .eq('id', setId).eq('company_id', companyId).single()

  return NextResponse.json({ data: set })
})
