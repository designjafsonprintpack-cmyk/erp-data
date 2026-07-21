import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { workflowTemplateSchema, workflowTemplateUpdateSchema } from '@/lib/schemas/settingsConfig'
import { REFERENCE_DATA_CACHE_HEADERS } from '@/lib/utils/cacheHeaders'

export const GET = withErrorHandling(async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase
    .from('workflow_templates' as any)
    .select('*, workflow_stages(*)')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const templates = (data ?? []).map((tpl: any) => ({
    ...tpl,
    workflow_stages: Array.isArray(tpl.workflow_stages)
      ? [...tpl.workflow_stages].filter((s: any) => !s.deleted_at).sort((a: any, b: any) => a.sequence_order - b.sequence_order)
      : [],
  }))

  return NextResponse.json({ data: templates }, { headers: REFERENCE_DATA_CACHE_HEADERS })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'workflow', 'create', supabase)
  if (denied) return denied
  const parsed = await parseBody(req, workflowTemplateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data
  const { data, error } = await supabase.from('workflow_templates' as any)
    .insert({ name: body.name, description: body.description, company_id: companyId })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'workflow', 'edit', supabase)
  if (denied) return denied
  const parsed = await parseBody(req, workflowTemplateUpdateSchema)
  if ('error' in parsed) return parsed.error
  const { id, ...fields } = parsed.data
  const { data, error } = await supabase.from('workflow_templates' as any).update(fields).eq('id', id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'workflow', 'delete', supabase)
  if (denied) return denied
  const { id } = await req.json()
  const { error } = await supabase.from('workflow_templates' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
