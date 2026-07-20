import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent, initializeJobWorkflow } from '@/modules/jobs/services/jobEventService'
import { checkLowStockAndNotify } from '@/lib/utils/checkLowStock'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const body = await req.json()

  const denied = await requirePermission(
    userTableId, 'qc', body.action === 'approve' ? 'approve' : body.action === 'reject' ? 'reject' : 'edit', supabase
  )
  if (denied) return denied

  const { data: rpr } = await supabase.from('reprint_requests' as any)
    .select('*, jobs!reprint_requests_original_job_id_fkey(*)')
    .eq('id', params.id).eq('company_id', companyId).single()
  if (!rpr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const req_ = rpr as any

  if (body.action === 'approve') {
    // Create a new repeat job for the re-print
    const origJob = req_.jobs
    const { data: jobNum } = await (supabase as any).rpc('get_next_sequence_number', {
      p_company_id: companyId, p_document_type: 'JOB',
    })

    const { data: newJob } = await supabase.from('jobs' as any).insert({
      company_id:           companyId,
      job_number:           jobNum,
      parent_job_id:        origJob.id,
      is_repeat:            true,
      repeat_sequence:      99, // reprint flag
      customer_id:          origJob.customer_id,
      job_title:            `${origJob.job_title} (Re-print)`,
      description:          `Re-print: ${req_.reason}`,
      size_l:               origJob.size_l, size_w: origJob.size_w, size_h: origJob.size_h,
      sheet_size:           origJob.sheet_size,
      grain_direction:      origJob.grain_direction,
      quantity:             req_.quantity,
      ups:                  origJob.ups,
      sheet_qty:            origJob.ups && origJob.ups > 0 ? Math.ceil(req_.quantity / origJob.ups) : null,
      no_of_colors:         origJob.no_of_colors,
      die_number:           origJob.die_number,
      board_type_id:        origJob.board_type_id,
      lamination_type_id:   origJob.lamination_type_id,
      uv_coating:           origJob.uv_coating,
      foil_type_id:         origJob.foil_type_id,
      special_finishing:    origJob.special_finishing,
      pasting:              origJob.pasting,
      workflow_template_id: origJob.workflow_template_id,
      priority:             req_.priority,
      status:               'new',
    }).select().single()

    if (newJob && origJob.workflow_template_id) {
      await initializeJobWorkflow((newJob as any).id, origJob.workflow_template_id, companyId, supabase)
    }

    const { data, error } = await supabase.from('reprint_requests' as any).update({
      status:         'approved',
      approved_by:    userTableId,
      approved_at:    new Date().toISOString(),
      reprint_job_id: (newJob as any)?.id || null,
    }).eq('id', params.id).eq('company_id', companyId).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Optional: auto-consume the extra material this re-print used, same
    // pattern as MRN issuance (see /api/v1/store/[id]).
    const qty = parseFloat(body.material_quantity || '0')
    if (body.board_item_id && qty > 0) {
      const { data: boardItem } = await supabase.from('board_inventory' as any)
        .select('current_stock').eq('id', body.board_item_id).eq('company_id', companyId).single()

      const stockBefore = Number((boardItem as any)?.current_stock ?? 0)
      if (stockBefore < qty) {
        return NextResponse.json({
          error: `Re-print approved, but could not deduct stock: only ${stockBefore} in stock for the linked inventory item (needed ${qty}). Adjust inventory manually.`,
        }, { status: 400 })
      }

      const stockAfter = stockBefore - qty
      await supabase.from('board_inventory' as any)
        .update({ current_stock: stockAfter }).eq('id', body.board_item_id).eq('company_id', companyId)

      await checkLowStockAndNotify(supabase, companyId, body.board_item_id, stockAfter)

      await supabase.from('board_inventory_movements' as any).insert({
        company_id:     companyId,
        board_item_id:  body.board_item_id,
        movement_type:  'out',
        quantity:       qty,
        balance_after:  stockAfter,
        reference_type: 'mrn', // reuse the same reference type used for material consumption
        reference_id:   params.id,
        job_id:         req_.original_job_id,
        notes:          `Re-print: ${req_.reason}`,
        moved_by:       userTableId,
      })
    }

    await recordJobEvent({
      company_id: companyId,
      job_id:     req_.original_job_id,
      event_type: 'repeat_created',
      new_value:  `Re-print job ${(newJob as any)?.job_number} created`,
      actor_id:   userTableId,
    }, supabase)

    return NextResponse.json({ data, reprint_job: newJob })
  }

  if (body.action === 'reject') {
    const { data, error } = await supabase.from('reprint_requests' as any).update({
      status: 'rejected',
      notes:  body.notes || null,
    }).eq('id', params.id).eq('company_id', companyId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  const { data, error } = await supabase.from('reprint_requests' as any)
    .update(body).eq('id', params.id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})
