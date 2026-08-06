import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { materialRequisitionSchema } from '@/lib/schemas/inventory'
import { isPageOutOfRange, outOfRangeResponse } from '@/lib/utils/pagedResponse'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''
  const search = searchParams.get('search') || ''
  const page   = parseInt(searchParams.get('page') || '1')
  // Was a hard 25 — the list pages ask for LIST_PAGE_SIZE (50) and Export
  // walks the pages in chunks of 200.
  const limit  = Math.min(parseInt(searchParams.get('limit') || '25') || 25, 200)
  const offset = (page - 1) * limit

  let q = supabase.from('material_requisitions' as any)
    .select('*, jobs(job_number,job_title), material_requisition_items(*)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (status) q = q.eq('status', status)
  if (search) q = q.ilike('mrn_number', `%${search}%`)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    // Tiebreaker — without it page 2 can repeat rows from page 1.
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)
  // A page past the end is an empty page, not a 500 — see pagedResponse.
  if (isPageOutOfRange(error)) return NextResponse.json(outOfRangeResponse(page, limit))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'store', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, materialRequisitionSchema)
  if ('error' in parsed) return parsed.error
  const { items, ...body } = parsed.data

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
        quantity_required: parseFloat(String(item.quantity_required ?? '0')),
        unit_id:          item.unit_id || null,
        // Stock row ab MRN banate waqt hi likhi jati hai. Issue ki window use
        // default bana leti hai, to board issue karne wale ko kuch chunna hi
        // nahi parta — aur stock ki katauti ka raasta khula rehta hai.
        board_item_id:    item.board_item_id || null,
        notes:            item.notes || null,
      }))
    )
  }

  return NextResponse.json({ data: mrn })
})
