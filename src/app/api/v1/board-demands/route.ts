import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { isPageOutOfRange, outOfRangeResponse } from '@/lib/utils/pagedResponse'
import { boardDemandCreateSchema } from '@/lib/schemas/boardDemand'
import { DEMAND_SELECT, decorateDemands } from '@/lib/utils/boardDemandQuery'
import { syncMissingBoardDemands } from '@/lib/utils/syncMissingBoardDemands'

/**
 * Board demands — "kya khareedna hai".
 *
 * Jobs ki demand khud banti hai (135, `resolve_board_demand`), is liye is route
 * ka POST sirf ek soorat ke liye hai: client ne FORECAST diya aur board pehle se
 * mangwa ke rakhna hai. Us demand ka koi job nahi hota; job baad mein banegi to
 * usi stock se match ho jayegi.
 */
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'purchase', 'view', supabase)
  if (denied) return denied

  // Koi chalti job bagair demand ke reh gayi ho to yahin pakri jayegi — chahe
  // wo purane code par bani ho ya kisi aise raaste se jis par hook lagana rah
  // gaya. Mamool mein 0 rows.
  await syncMissingBoardDemands(supabase, companyId)

  const { searchParams } = new URL(req.url)
  // Default: sirf wo jin par kaam baqi hai. 'all' sab dikhata hai.
  const status = searchParams.get('status') || 'pending'
  const page   = parseInt(searchParams.get('page') || '1')
  const limit  = Math.min(parseInt(searchParams.get('limit') || '20') || 20, 200)
  const offset = (page - 1) * limit

  let q = supabase.from('board_demands' as any)
    .select(DEMAND_SELECT, { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (status === 'pending')      q = q.in('status', ['open', 'partially_ordered'])
  else if (status === 'ordered') q = q.eq('status', 'ordered')
  else if (status === 'ready')   q = q.eq('status', 'ready')
  else if (status && status !== 'all') q = q.eq('status', status)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    // Tiebreaker — bagair iske page 2 par wahi rows dobara aa sakti hain.
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)

  if (isPageOutOfRange(error)) return NextResponse.json(outOfRangeResponse(page, limit))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: await decorateDemands(supabase, companyId, (data ?? []) as any[]),
    total: count ?? 0, page, limit,
  })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'purchase', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, boardDemandCreateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const sheets = Number(body.sheets_required)

  // Forecast wali demand STOCK SE MATCH NAHI HOTI. Job wali demand ka maqsad
  // "kam se kam khareedo" hai, is liye wo pehle leftover dhoondti hai; forecast
  // ka maqsad hi ye hai ke maal pehle se aa kar para rahe. Isay bhi mojooda
  // stock par lagate to wo aane wale kaam ka board kisi aur ki reservation bana
  // deta aur khareed kabhi hoti hi nahi.
  const { data, error } = await supabase.from('board_demands' as any).insert({
    company_id:         companyId,
    job_id:             null,
    board_type_id:      body.board_type_id || null,
    paper_type_id:      body.paper_type_id || null,
    material_name:      body.material_name,
    gsm:                body.gsm ?? null,
    sheet_width_in:     body.sheet_width_in ?? null,
    sheet_height_in:    body.sheet_height_in ?? null,
    sheets_required:    sheets,
    board_item_id:      body.board_item_id || null,
    sheets_from_stock:  0,
    sheets_to_purchase: sheets,
    status:             'open',
    notes:              body.notes || null,
    created_by:         userTableId,
    updated_by:         userTableId,
  }).select(DEMAND_SELECT).single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const [row] = await decorateDemands(supabase, companyId, [data as any])
  return NextResponse.json({ data: row })
})
