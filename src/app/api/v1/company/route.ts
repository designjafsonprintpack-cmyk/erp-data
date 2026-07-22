import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { companyUpdateSchema } from '@/lib/schemas/settingsConfig'

export const GET = withErrorHandling(async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)

  const [companyRes, branchesRes, warehousesRes] = await Promise.all([
    supabase.from('companies' as any).select('*').eq('id', companyId).single(),
    supabase.from('branches' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('warehouses' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('name'),
  ])

  return NextResponse.json({
    company: companyRes.data,
    branches: branchesRes.data ?? [],
    warehouses: warehousesRes.data ?? [],
  })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, companyUpdateSchema)
  if ('error' in parsed) return parsed.error
  const { name, ntn, address, logo_url } = parsed.data

  const { data, error } = await supabase
    .from('companies' as any)
    .update({ name, ntn, address, logo_url })
    .eq('id', companyId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})
