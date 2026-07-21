import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { colorSpecSchema, colorSpecUpdateSchema } from '@/lib/schemas/colorSpec'
import { REFERENCE_DATA_CACHE_HEADERS } from '@/lib/utils/cacheHeaders'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const customerId = searchParams.get('customer_id') || ''

  let q = supabase.from('color_specs' as any)
    .select('*, customers(name)')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .is('deleted_at', null)

  if (search) q = q.or(`name.ilike.%${search}%,pantone_code.ilike.%${search}%`)
  if (customerId) q = q.eq('customer_id', customerId)

  const { data, error } = await q.order('name').limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] }, { headers: REFERENCE_DATA_CACHE_HEADERS })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, colorSpecSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const { data, error } = await supabase.from('color_specs' as any).insert({
    company_id:   companyId,
    name:         body.name,
    color_type:   body.color_type,
    pantone_code: body.pantone_code || null,
    cmyk_c:       body.cmyk_c != null ? parseFloat(String(body.cmyk_c)) : null,
    cmyk_m:       body.cmyk_m != null ? parseFloat(String(body.cmyk_m)) : null,
    cmyk_y:       body.cmyk_y != null ? parseFloat(String(body.cmyk_y)) : null,
    cmyk_k:       body.cmyk_k != null ? parseFloat(String(body.cmyk_k)) : null,
    hex_preview:  body.hex_preview || null,
    customer_id:  body.customer_id || null,
    notes:        body.notes || null,
    created_by:   userTableId,
    updated_by:   userTableId,
  }).select('*, customers(name)').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, colorSpecUpdateSchema)
  if ('error' in parsed) return parsed.error
  const { id, ...body } = parsed.data
  const rawBody = body as Record<string, any>

  const fields: Record<string, any> = { updated_by: userTableId }
  if ('name' in rawBody) fields.name = rawBody.name
  if ('color_type' in rawBody) fields.color_type = rawBody.color_type
  if ('pantone_code' in rawBody) fields.pantone_code = rawBody.pantone_code || null
  if ('cmyk_c' in rawBody) fields.cmyk_c = rawBody.cmyk_c != null ? parseFloat(String(rawBody.cmyk_c)) : null
  if ('cmyk_m' in rawBody) fields.cmyk_m = rawBody.cmyk_m != null ? parseFloat(String(rawBody.cmyk_m)) : null
  if ('cmyk_y' in rawBody) fields.cmyk_y = rawBody.cmyk_y != null ? parseFloat(String(rawBody.cmyk_y)) : null
  if ('cmyk_k' in rawBody) fields.cmyk_k = rawBody.cmyk_k != null ? parseFloat(String(rawBody.cmyk_k)) : null
  if ('hex_preview' in rawBody) fields.hex_preview = rawBody.hex_preview || null
  if ('customer_id' in rawBody) fields.customer_id = rawBody.customer_id || null
  if ('notes' in rawBody) fields.notes = rawBody.notes || null

  const { data, error } = await supabase.from('color_specs' as any)
    .update(fields).eq('id', id).eq('company_id', companyId)
    .select('*, customers(name)').single()

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

  const { error } = await supabase.from('color_specs' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: userTableId })
    .eq('id', id).eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
