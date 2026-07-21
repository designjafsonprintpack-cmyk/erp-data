import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data: plate, error } = await supabase
    .from('plates' as any)
    .select('*, origin_job:jobs!plates_origin_job_id_fkey(job_number,job_title)')
    .eq('id', params.id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!plate) return NextResponse.json({ error: 'Plate not found' }, { status: 404 })

  const { data: history } = await supabase
    .from('job_plates' as any)
    .select('*, jobs(job_number,job_title), machines(name,code)')
    .eq('plate_id', params.id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('assigned_at', { ascending: false })

  return NextResponse.json({ data: { ...(plate as any), history: history ?? [] } })
})

const VALID_SIZES = ['1030 x 790', '1030 x 770']

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'plates', 'edit', supabase)
  if (denied) return denied

  const body = await req.json()
  const update: Record<string, any> = { updated_by: userTableId }

  // Changing the size (the "plate got manually cut down" case) auto-notes
  // it in remarks instead of a silent overwrite — the physical plate is the
  // same one, just trimmed, so this stays one row rather than a new plate.
  if (body.plate_size !== undefined) {
    if (body.plate_size && !VALID_SIZES.includes(body.plate_size)) {
      return NextResponse.json({ error: 'Invalid plate size' }, { status: 400 })
    }
    const { data: current } = await supabase.from('plates' as any).select('plate_size, remarks').eq('id', params.id).eq('company_id', companyId).single()
    const oldSize = (current as any)?.plate_size
    if (oldSize && body.plate_size && oldSize !== body.plate_size) {
      const note = `Cut from ${oldSize} to ${body.plate_size} on ${new Date().toISOString().slice(0, 10)}`
      const existingRemarks = (current as any)?.remarks
      update.remarks = existingRemarks ? `${existingRemarks}\n${note}` : note
    }
    update.plate_size = body.plate_size
  }

  if (body.status !== undefined) {
    if (!['in_storage', 'in_use', 'damaged'].includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    update.status = body.status
  }
  if (body.color !== undefined) update.color = body.color
  if (body.made_date !== undefined) update.made_date = body.made_date

  const { data, error } = await supabase
    .from('plates' as any)
    .update(update)
    .eq('id', params.id)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'plates', 'delete', supabase)
  if (denied) return denied

  const { error } = await supabase
    .from('plates' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: userTableId })
    .eq('id', params.id)
    .eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { success: true } })
})
