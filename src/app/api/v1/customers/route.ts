import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { escapeFilterValue } from '@/lib/utils/escapeFilterValue'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { customerSchema } from '@/lib/schemas/customer'
import { runNewCustomerRule } from '@/lib/utils/automationEngine'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'customers', 'view', supabase)
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const stage = searchParams.get('stage') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '25')
  const offset = (page - 1) * limit

  let query = supabase.from('customers' as any).select('*', { count: 'exact' })
    .is('deleted_at', null).eq('is_active', true)

  if (stage) query = query.eq('pipeline_stage', stage)
  if (search) {
    query = query.or(`name.ilike."%${escapeFilterValue(search)}%",customer_code.ilike."%${escapeFilterValue(search)}%",email.ilike."%${escapeFilterValue(search)}%",phone.ilike."%${escapeFilterValue(search)}%"`)
  }

  const { data, error, count } = await query.order('name').range(offset, offset + limit - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'customers', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, customerSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  // Duplicate detection: an exact match on NTN or phone/mobile is a strong
  // signal this customer already exists. Warn (409) instead of silently
  // creating a duplicate — the caller can resubmit with force:true to
  // proceed anyway (e.g. a second branch that genuinely shares a phone line).
  // NOTE: each value is passed as a bound .eq()/.in() parameter, never
  // interpolated into a filter string — building an .or() string from raw
  // user input is a filter-injection risk (PostgREST parses commas/operators
  // in that string), so we run separate queries and merge in JS instead.
  if (!body.force) {
    const dupeQueries: any[] = []

    if (body.ntn?.trim()) {
      dupeQueries.push(
        supabase.from('customers' as any)
          .select('id, name, customer_code, ntn, phone, mobile')
          .is('deleted_at', null).eq('ntn', body.ntn.trim()).limit(5)
      )
    }
    const phoneVals = [body.phone?.trim(), body.mobile?.trim()].filter(Boolean) as string[]
    if (phoneVals.length) {
      dupeQueries.push(
        supabase.from('customers' as any)
          .select('id, name, customer_code, ntn, phone, mobile')
          .is('deleted_at', null).in('phone', phoneVals).limit(5)
      )
      dupeQueries.push(
        supabase.from('customers' as any)
          .select('id, name, customer_code, ntn, phone, mobile')
          .is('deleted_at', null).in('mobile', phoneVals).limit(5)
      )
    }

    if (dupeQueries.length) {
      const results = await Promise.all(dupeQueries)
      const seen = new Map<string, any>()
      for (const r of results) {
        for (const row of (r.data ?? []) as any[]) seen.set(row.id, row)
      }
      const possibleDupes = Array.from(seen.values())

      if (possibleDupes.length) {
        return NextResponse.json({
          error: `A customer with the same ${body.ntn?.trim() ? 'NTN or ' : ''}phone number may already exist.`,
          duplicates: possibleDupes,
        }, { status: 409 })
      }
    }
  }

  // Generate customer code atomically
  const { data: seqData } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId,
    p_document_type: 'CUST',
  })

  const { force, ...customerFields } = body

  const { data, error } = await supabase.from('customers' as any).insert({
    ...customerFields,
    company_id: companyId,
    customer_code: seqData || `CUST-${Date.now()}`,
    credit_limit: parseFloat(String(body.credit_limit ?? '0')),
    payment_terms: parseInt(String(body.payment_terms ?? '30')),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Non-blocking — a rule failure must never affect customer creation itself
  runNewCustomerRule(supabase, companyId, (data as any).id, (data as any).name).catch(() => {})

  return NextResponse.json({ data })
})
