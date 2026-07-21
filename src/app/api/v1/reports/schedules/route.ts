import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { reportScheduleSchema } from '@/lib/schemas/report'

export const GET = withErrorHandling(async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase.from('report_schedules' as any)
    .select('*').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'reports', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, reportScheduleSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const { data, error } = await supabase.from('report_schedules' as any).insert({
    company_id:  companyId,
    report_type: body.report_type,
    frequency:   body.frequency,
    recipients:  body.recipients,
    created_by:  userTableId,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})
