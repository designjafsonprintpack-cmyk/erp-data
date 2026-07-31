/**
 * Gang runs — two jobs on one sheet (migration 126).
 *
 * POST creates one. It is the only place that writes the agreed figures, and
 * it writes them in a deliberate order: validate everything first, then the
 * gang, then the jobs, then the Sales Order. Nothing is half-applied on a
 * validation failure because none of it starts until every check has passed.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { gangSchema } from '@/lib/schemas/gang'
import { gangScenario, type GangMemberInput } from '@/lib/utils/gangCalc'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { isPageOutOfRange, outOfRangeResponse } from '@/lib/utils/pagedResponse'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const page  = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const status = searchParams.get('status') || ''
  const offset = (page - 1) * limit

  let q = supabase.from('job_gangs' as any)
    .select('*, customers(name,customer_code), job_gang_members(id,job_id,ups_on_layout,original_quantity,original_ups,jobs(job_number,job_title,quantity))', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
  if (status) q = q.eq('status', status)

  // .order('id') is the paging tiebreaker every list in this codebase needs.
  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)

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
  // Ganging is a planning decision — which jobs share a press run.
  const denied = await requirePermission(userTableId, 'planning', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, gangSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const jobIds = body.members.map(m => m.job_id)
  if (new Set(jobIds).size !== jobIds.length) {
    return NextResponse.json({ error: 'The same job is listed twice.' }, { status: 400 })
  }

  // ─── Read every member job, once ─────────────────────────────────────────
  const { data: jobsData, error: jobsErr } = await supabase
    .from('jobs' as any)
    .select('id,job_number,job_title,customer_id,quantity,ups,board_type_id,sheet_width_in,sheet_height_in,status,sales_order_id,sales_order_item_id')
    .in('id', jobIds).eq('company_id', companyId).is('deleted_at', null)

  if (jobsErr) return NextResponse.json({ error: jobsErr.message }, { status: 500 })
  const jobs = (jobsData ?? []) as any[]
  if (jobs.length !== jobIds.length) {
    return NextResponse.json({ error: 'One of those jobs was not found.' }, { status: 404 })
  }

  // ─── The physical requirements ───────────────────────────────────────────
  // Two jobs cannot share a sheet unless the sheet and the board are the same.
  // These are refusals, not warnings: no shop practice makes them work.
  const problems: string[] = []
  const first = jobs[0]
  const same = (k: string) => jobs.every(j => String(j[k] ?? '') === String(first[k] ?? ''))

  if (!same('customer_id')) problems.push('All jobs in a gang must be for the same customer.')
  if (!same('board_type_id')) problems.push('All jobs must be on the same board type.')
  if (!same('sheet_width_in') || !same('sheet_height_in')) {
    problems.push('All jobs must be on the same sheet size.')
  }
  if (!first.board_type_id) problems.push('The jobs have no board type set — a gang needs one.')
  if (!first.sheet_width_in || !first.sheet_height_in) {
    problems.push('The jobs have no sheet size set — a gang needs one.')
  }
  for (const j of jobs) {
    if (['completed', 'dispatched', 'cancelled'].includes(String(j.status))) {
      problems.push(`${j.job_number} is ${j.status} and cannot be ganged.`)
    }
  }

  // Already in a live gang? The split is chosen so both jobs finish together,
  // so a job is never half in one gang and half in another.
  const { data: existing, error: exErr } = await supabase
    .from('job_gang_members' as any)
    .select('job_id, job_gangs(gang_number)')
    .in('job_id', jobIds).eq('company_id', companyId).is('deleted_at', null)
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
  for (const e of ((existing ?? []) as any[])) {
    const j = jobs.find(x => x.id === e.job_id)
    problems.push(`${j?.job_number ?? 'A job'} is already in ${e.job_gangs?.gang_number ?? 'another gang'}.`)
  }

  // Shared work already under way? Ganging after Board Issue has started would
  // mean board already issued against the job on its own.
  const { data: started, error: stErr } = await supabase
    .from('job_stage_progress' as any)
    .select('job_id, status, workflow_stages!inner(name, is_gang_shared)')
    .in('job_id', jobIds).eq('company_id', companyId)
    .eq('workflow_stages.is_gang_shared', true)
    .neq('status', 'pending')
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 })
  for (const s of ((started ?? []) as any[])) {
    const j = jobs.find(x => x.id === s.job_id)
    problems.push(`${j?.job_number ?? 'A job'} has already started "${s.workflow_stages?.name}" — gang it before production begins.`)
  }

  // ─── The arithmetic ──────────────────────────────────────────────────────
  const upsByJob: Record<string, number> = {}
  for (const m of body.members) upsByJob[m.job_id] = m.ups_on_layout

  const calcInput: GangMemberInput[] = jobs.map(j => ({
    jobId: j.id,
    jobNumber: j.job_number,
    jobTitle: j.job_title,
    orderedQty: Number(j.quantity) || 0,
    ownUps: Number(j.ups) || 0,
  }))
  const scenario = gangScenario(body.layout_ups, calcInput, upsByJob)
  problems.push(...scenario.problems)

  if (problems.length) {
    return NextResponse.json({ error: problems[0], problems, code: 'GANG_INVALID' }, { status: 400 })
  }

  // The client has to have agreed before the Sales Order is rewritten.
  const overaged = scenario.lines.filter(l => l.overage > 0)
  if (overaged.length && !body.overage_agreed) {
    return NextResponse.json({
      error:
        `This gang produces more than was ordered: ` +
        overaged.map(l => `${l.jobNumber} ${l.orderedQty.toLocaleString()} → ${l.produced.toLocaleString()} (+${l.overage.toLocaleString()})`).join(', ') +
        `. Confirm the customer has agreed before the Sales Order is changed.`,
      lines: scenario.lines,
      code: 'OVERAGE_NOT_AGREED',
    }, { status: 409 })
  }

  // ─── Write ───────────────────────────────────────────────────────────────
  const { data: gangNumber } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId, p_document_type: 'GANG',
  })

  const { data: gang, error: gErr } = await supabase.from('job_gangs' as any).insert({
    company_id: companyId,
    gang_number: gangNumber || `GANG-${Date.now()}`,
    customer_id: first.customer_id,
    layout_ups: body.layout_ups,
    sheet_count: scenario.sheets,
    board_type_id: first.board_type_id,
    sheet_width_in: first.sheet_width_in,
    sheet_height_in: first.sheet_height_in,
    notes: body.notes || null,
    created_by: userTableId,
  }).select().single()
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })

  const gangId = (gang as any).id
  const warnings: string[] = []

  for (const line of scenario.lines) {
    const job = jobs.find(j => j.id === line.jobId)!

    // The membership carries what the job WAS, so a repeat next time starts
    // from its own die layout and its own order — a gang never follows a
    // product forward (migration 126's header).
    const { error: mErr } = await supabase.from('job_gang_members' as any).insert({
      company_id: companyId,
      gang_id: gangId,
      job_id: job.id,
      ups_on_layout: line.ups,
      original_quantity: job.quantity,
      original_ups: job.ups,
      created_by: userTableId,
    })
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

    // The job now runs at the gang's ups and the agreed quantity. sheet_qty
    // follows the same locked rule as everywhere else and lands on the run's
    // sheet count for every member — that identity is the gang's own check.
    const { error: jErr } = await supabase.from('jobs' as any).update({
      ups: line.ups,
      quantity: line.produced,
      sheet_qty: Math.ceil(line.produced / line.ups),
      updated_by: userTableId,
    }).eq('id', job.id).eq('company_id', companyId)
    if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 })

    // The Sales Order follows, because it is the document everyone downstream
    // reads. Mehboob: "werna to hum bad main bhool jaey gy k humary pas 10000
    // ki jagha 12000 hy." The quotation keeps the original figure and
    // sales_order_items.quotation_item_id still points at it.
    if (job.sales_order_item_id && line.produced !== line.orderedQty) {
      const { data: soItem, error: soReadErr } = await supabase
        .from('sales_order_items' as any)
        .select('id, unit_price, sales_order_id')
        .eq('id', job.sales_order_item_id).eq('company_id', companyId).maybeSingle()

      if (soReadErr || !soItem) {
        warnings.push(`${job.job_number}: could not update the sales order line.`)
      } else {
        const unit = Number((soItem as any).unit_price) || 0
        const { error: soErr } = await supabase.from('sales_order_items' as any).update({
          quantity: line.produced,
          subtotal: Math.round(unit * line.produced * 100) / 100,
          updated_by: userTableId,
        }).eq('id', (soItem as any).id).eq('company_id', companyId)
        if (soErr) warnings.push(`${job.job_number}: sales order line not updated — ${soErr.message}`)
        else await recalcSalesOrderTotal(supabase, companyId, (soItem as any).sales_order_id, warnings)
      }
    }

    await recordJobEvent({
      company_id: companyId, job_id: job.id,
      // Added to the CHECK by 126. `job_updated` — the obvious name — is NOT a
      // valid event_type, and recordJobEvent() only console.errors a rejected
      // insert, so using it would have lost every gang from the audit trail.
      event_type: 'gang_created',
      new_value:
        `Ganged as ${(gang as any).gang_number} — ${line.ups} of ${body.layout_ups} ups, ` +
        `${scenario.sheets.toLocaleString()} sheets` +
        (line.overage > 0
          ? `, quantity ${line.orderedQty.toLocaleString()} → ${line.produced.toLocaleString()} (+${line.overage.toLocaleString()}, agreed with customer)`
          : ''),
      actor_id: userTableId,
    }, supabase)
  }

  return NextResponse.json({ data: gang, scenario, warnings })
})

/**
 * Re-totals a sales order from its live line items.
 *
 * USES THE ORDER'S OWN DISCOUNT — the first draft did not, and set
 * `total_amount = subtotal`, which would have silently wiped the discount off
 * any order that had one. There is no server-side formula to borrow: the SO
 * POST route takes the totals straight from the request body, so the only
 * definition of "the total" lives in `SOFormClient`:
 *
 *     subtotal = SUM(quantity x unit_price)
 *     discount = subtotal x discount_percent / 100
 *     total    = subtotal - discount          (tax_amount is always 0 there)
 *
 * That is mirrored exactly here. If the form's formula ever grows tax, this
 * has to follow — flagged in CLAUDE.md rather than left to be discovered.
 *
 * A failure is a warning, not a 500: the line and the job are already correct,
 * and losing the whole gang over a header total would be worse.
 */
async function recalcSalesOrderTotal(
  supabase: any, companyId: string, salesOrderId: string, warnings: string[],
): Promise<void> {
  const [linesRes, headRes] = await Promise.all([
    supabase.from('sales_order_items' as any)
      .select('subtotal')
      .eq('sales_order_id', salesOrderId).eq('company_id', companyId)
      .is('deleted_at', null),
    supabase.from('sales_orders' as any)
      .select('discount_percent, tax_amount')
      .eq('id', salesOrderId).eq('company_id', companyId).maybeSingle(),
  ])

  if (linesRes.error || headRes.error || !headRes.data) {
    warnings.push(`Sales order total not recalculated: ${linesRes.error?.message ?? headRes.error?.message ?? 'order not found'}`)
    return
  }

  const subtotal = ((linesRes.data ?? []) as any[])
    .reduce((s, l) => s + (Number(l.subtotal) || 0), 0)
  const pct = Number((headRes.data as any).discount_percent) || 0
  const discount = Math.round(subtotal * (pct / 100) * 100) / 100
  // tax_amount is carried through untouched rather than recomputed — nothing
  // in this app sets it to anything but 0, and inventing a tax rule here would
  // be worse than preserving whatever is on the row.
  const tax = Number((headRes.data as any).tax_amount) || 0
  const total = Math.round((subtotal - discount + tax) * 100) / 100

  const { error: upErr } = await supabase.from('sales_orders' as any)
    .update({ subtotal, discount_amount: discount, total_amount: total })
    .eq('id', salesOrderId).eq('company_id', companyId)
  if (upErr) warnings.push(`Sales order total not recalculated: ${upErr.message}`)
}
