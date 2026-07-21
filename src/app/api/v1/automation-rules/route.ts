import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { automationRuleUpsertSchema } from '@/lib/schemas/automationRule'

export const GET = withErrorHandling(async function GET(_req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'view', supabase)
  if (denied) return denied

  const { data, error } = await supabase.from('automation_rules' as any)
    .select('id, rule_type, name, is_active, config, last_run_at, created_at')
    .eq('company_id', companyId).is('deleted_at', null)
    .order('rule_type')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
})

// Upsert by (company_id, rule_type) — the UI presents 3 fixed rule types,
// not a free-form list, so "create" and "edit" are the same operation:
// configure this rule type's settings, matching the UNIQUE constraint.
export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, automationRuleUpsertSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const { data, error } = await supabase.from('automation_rules' as any).upsert({
    company_id: companyId,
    rule_type: body.rule_type,
    name: body.name,
    is_active: body.is_active ?? true,
    config: body.config ?? {},
    created_by: userTableId,
    updated_by: userTableId,
  }, { onConflict: 'company_id,rule_type' })
    .select('id, rule_type, name, is_active, config, last_run_at, created_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})
