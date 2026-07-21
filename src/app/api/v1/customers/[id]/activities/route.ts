import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { customerActivitySchema } from '@/lib/schemas/crmSubResource'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase.from('customer_activities' as any)
    .select('*, users(full_name)')
    .eq('company_id', companyId).eq('customer_id', params.id).is('deleted_at', null)
    .order('activity_date', { ascending: false }).limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
})

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'customers', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, customerActivitySchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const { data, error } = await supabase.from('customer_activities' as any).insert({
    company_id:    companyId,
    customer_id:   params.id,
    activity_type: body.activity_type,
    subject:       body.subject,
    notes:         body.notes || null,
    activity_date: body.activity_date || new Date().toISOString(),
    logged_by:     userTableId,
  }).select('*, users(full_name)').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})
