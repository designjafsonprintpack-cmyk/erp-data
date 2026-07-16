import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''
  const search = searchParams.get('search') || ''
  const page   = parseInt(searchParams.get('page') || '1')
  const limit  = 25; const offset = (page - 1) * limit

  let q = supabase.from('dispatch_orders' as any)
    .select(`
      *,
      customers(name,customer_code,phone,mobile),
      dispatch_items(*, jobs(job_number,job_title)),
      proof_of_delivery(id,received_by,received_at,condition)
    `, { count: 'exact' })
    .is('deleted_at', null)

  if (status) q = q.eq('status', status)
  if (search) q = q.or(`dispatch_number.ilike.%${search}%,delivery_contact.ilike.%${search}%`)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const { items, ...body } = await req.json()

  // Auto dispatch number
  const { data: dispNumber } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId, p_document_type: 'DISP',
  })

  const { data: dispatch, error } = await supabase.from('dispatch_orders' as any).insert({
    company_id:          companyId,
    dispatch_number:     dispNumber,
    customer_id:         body.customer_id,
    status:              'pending',
    delivery_address:    body.delivery_address || null,
    delivery_city:       body.delivery_city || null,
    delivery_contact:    body.delivery_contact || null,
    delivery_phone:      body.delivery_phone || null,
    dispatch_method:     body.dispatch_method || 'own_vehicle',
    vehicle_number:      body.vehicle_number || null,
    driver_name:         body.driver_name || null,
    driver_phone:        body.driver_phone || null,
    courier_name:        body.courier_name || null,
    tracking_number:     body.tracking_number || null,
    scheduled_date:      body.scheduled_date || null,
    delivery_charges:    body.delivery_charges ? parseFloat(body.delivery_charges) : 0,
    notes:               body.notes || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const disp = dispatch as any

  // Insert line items
  if (items?.length) {
    await supabase.from('dispatch_items' as any).insert(
      items.map((item: any, idx: number) => ({
        company_id:          companyId,
        dispatch_id:         disp.id,
        job_id:              item.job_id,
        quantity_ordered:    parseFloat(item.quantity_ordered || '0'),
        quantity_dispatched: parseFloat(item.quantity_dispatched || item.quantity_ordered || '0'),
        carton_count:        item.carton_count ? parseInt(item.carton_count) : 0,
        weight_kg:           item.weight_kg ? parseFloat(item.weight_kg) : null,
        notes:               item.notes || null,
        sort_order:          idx + 1,
      }))
    )

    // Record timeline event on each job
    for (const item of items) {
      await recordJobEvent({
        company_id: companyId,
        job_id:     item.job_id,
        event_type: 'status_changed',
        new_value:  `Dispatch challan ${dispNumber} created`,
        actor_id:   user.id,
      }, supabase)
    }
  }

  return NextResponse.json({ data: disp })
}
