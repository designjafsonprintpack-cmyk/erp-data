import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { vendorUpdateSchema } from '@/lib/schemas/vendor'
import { guardDuplicateName } from '@/lib/utils/duplicateName'
import { guardDelete, VENDOR_DEPENDENTS } from '@/lib/utils/deleteGuard'

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'purchase', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, vendorUpdateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  if (body.name !== undefined) {
    const dupe = await guardDuplicateName(supabase, 'vendor', {
      table: 'vendors',
      companyId,
      name: body.name,
      codeColumn: 'vendor_code',
      excludeId: params.id,
    })
    if (dupe) return dupe
  }

  const { data, error } = await supabase.from('vendors' as any)
    .update(body).eq('id', params.id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'purchase', 'delete', supabase)
  if (denied) return denied

  // A vendor carries board stock and lots since 113 — deleting one silently
  // takes the supplier's name off the monthly board report's first grouping.
  if (new URL(req.url).searchParams.get('force') !== '1') {
    const blocked = await guardDelete(supabase, params.id, VENDOR_DEPENDENTS, 'vendor')
    if (blocked) return blocked
  }

  const { error } = await supabase.from('vendors' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', params.id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
