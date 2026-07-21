import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { webhookEndpointSchema, webhookEndpointUpdateSchema } from '@/lib/schemas/webhook'
import crypto from 'crypto'

// Only the settings module gates access — webhook endpoints control where
// business data gets sent externally, same sensitivity tier as service-role
// usage, so this is deliberately admin-only rather than every module's own
// 'create' permission.

export const GET = withErrorHandling(async function GET(_req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'view', supabase)
  if (denied) return denied

  // secret is never returned after creation — the row only proves one exists
  const { data, error } = await supabase.from('webhook_endpoints' as any)
    .select('id, name, url, event_types, is_active, created_at')
    .eq('company_id', companyId).is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, webhookEndpointSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const secret = crypto.randomBytes(32).toString('hex')

  const { data, error } = await supabase.from('webhook_endpoints' as any).insert({
    company_id:   companyId,
    name:         body.name,
    url:          body.url,
    secret,
    event_types:  body.event_types,
    is_active:    body.is_active ?? true,
    created_by:   userTableId,
    updated_by:   userTableId,
  }).select('id, name, url, event_types, is_active, created_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // secret is returned ONLY on this one create response — Mehboob must
  // copy it now, same convention as most API-key-issuing systems
  return NextResponse.json({ data: { ...(data as any), secret } })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, webhookEndpointUpdateSchema)
  if ('error' in parsed) return parsed.error
  const { id, ...fields } = parsed.data

  const { data, error } = await supabase.from('webhook_endpoints' as any)
    .update({ ...fields, updated_by: userTableId })
    .eq('id', id).eq('company_id', companyId)
    .select('id, name, url, event_types, is_active, created_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'delete', supabase)
  if (denied) return denied

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabase.from('webhook_endpoints' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: userTableId })
    .eq('id', id).eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
