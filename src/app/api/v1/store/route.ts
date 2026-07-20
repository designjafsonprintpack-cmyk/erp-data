import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''
  const search = searchParams.get('search') || ''
  const page   = parseInt(searchParams.get('page') || '1')
  const limit  = 25; const offset = (page - 1) * limit

  let q = supabase.from('material_requisitions' as any)
    .select('*, jobs(job_number,job_title), material_requisition_items(*)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (status) q = q.eq('status', status)
  if (search) q = q.ilike('mrn_number', `%${search}%`)

  const { data, error, count } = await q
    .order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'store', 'create', supabase)
  if (denied) return denied

  const { items, ...body } = await req.json()

  const { data: mrnNumber } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId, p_document_type: 'MRN',
  })

  const { data: mrn, error } = await supabase.from('material_requisitions' as any).insert({
    company_id:    companyId,
    mrn_number:    mrnNumber,
    job_id:        body.job_id || null,
    requested_by:  userTableId,
    required_date: body.required_date || null,
    notes:         body.notes || null,
    status:        'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (items?.length) {
    await supabase.from('material_requisition_items' as any).insert(
      items.map((item: any) => ({
        company_id:       companyId,
        requisition_id:   (mrn as any).id,
        material_name:    item.material_name,
        material_type:    item.material_type || null,
        specification:    item.specification || null,
        quantity_required: parseFloat(item.quantity_required || '0'),
        unit_id:          item.unit_id || null,
        notes:            item.notes || null,
      }))
    )
  }

  return NextResponse.json({ data: mrn })
})
