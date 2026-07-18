import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('job_id') || ''

  let q = supabase.from('job_costings' as any)
    .select('*, jobs(job_number,job_title,quoted_amount,customers(name)), job_costing_lines(*)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('is_active', true)

  if (jobId) q = q.eq('job_id', jobId)

  const { data, error, count } = await q.order('created_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'finance', 'create', supabase)
  if (denied) return denied

  const { extra_lines, ...body } = await req.json()

  // Compute totals
  const directCosts = [
    'board_cost','printing_cost','plate_cost','ink_cost',
    'lamination_cost','foiling_cost','uv_cost','die_cutting_cost',
    'pasting_cost','other_finishing','labour_cost',
  ].reduce((s, k) => s + parseFloat(body[k] || '0'), 0)

  const extraTotal  = (extra_lines || []).reduce((s: number, l: any) => s + parseFloat(l.amount || '0'), 0)
  const overheadPct = parseFloat(body.overhead_pct || '15')
  const overhead    = (directCosts + extraTotal) * overheadPct / 100
  const totalCost   = directCosts + extraTotal + overhead
  const quoted      = body.quoted_amount ? parseFloat(body.quoted_amount) : null
  const margin      = quoted ? quoted - totalCost : null
  const marginPct   = quoted && quoted > 0 ? ((margin! / quoted) * 100) : null

  const { data: costing, error } = await supabase.from('job_costings' as any).upsert({
    company_id:       companyId,
    job_id:           body.job_id,
    board_cost:       parseFloat(body.board_cost || '0'),
    board_sheets:     body.board_sheets ? parseFloat(body.board_sheets) : null,
    board_rate:       body.board_rate ? parseFloat(body.board_rate) : null,
    printing_cost:    parseFloat(body.printing_cost || '0'),
    printing_plates:  body.printing_plates ? parseInt(body.printing_plates) : 0,
    plate_cost:       parseFloat(body.plate_cost || '0'),
    ink_cost:         parseFloat(body.ink_cost || '0'),
    lamination_cost:  parseFloat(body.lamination_cost || '0'),
    foiling_cost:     parseFloat(body.foiling_cost || '0'),
    uv_cost:          parseFloat(body.uv_cost || '0'),
    die_cutting_cost: parseFloat(body.die_cutting_cost || '0'),
    pasting_cost:     parseFloat(body.pasting_cost || '0'),
    other_finishing:  parseFloat(body.other_finishing || '0'),
    labour_cost:      parseFloat(body.labour_cost || '0'),
    overhead_pct:     overheadPct,
    overhead_amount:  overhead,
    total_cost:       totalCost,
    quoted_amount:    quoted,
    margin_amount:    margin,
    margin_pct:       marginPct,
    costing_notes:    body.costing_notes || null,
    costed_by:        userTableId,
    costed_at:        new Date().toISOString(),
  }, { onConflict: 'company_id,job_id' }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const cost = costing as any

  // Replace extra lines
  await supabase.from('job_costing_lines' as any)
    .update({ is_active: false }).eq('costing_id', cost.id).eq('company_id', companyId)

  if (extra_lines?.length) {
    await supabase.from('job_costing_lines' as any).insert(
      extra_lines.map((l: any, idx: number) => ({
        company_id:  companyId,
        costing_id:  cost.id,
        description: l.description,
        category:    l.category || null,
        quantity:    parseFloat(l.quantity || '1'),
        unit_rate:   parseFloat(l.unit_rate || '0'),
        amount:      parseFloat(l.amount || '0'),
        sort_order:  idx + 1,
      }))
    )
  }

  return NextResponse.json({ data: cost })
}
