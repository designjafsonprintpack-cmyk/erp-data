import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { sendWhatsApp } from '@/lib/utils/sendWhatsApp'
import { notify } from '@/modules/notifications/services/notificationService'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('dispatch_orders' as any)
    .select(`
      *,
      customers(name,customer_code,address,phone,mobile,email),
      dispatch_items(*, jobs(job_number,job_title,quantity,customers(name))),
      proof_of_delivery(*)
    `)
    .eq('id', params.id).single()

  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'dispatch', 'edit', supabase)
  if (denied) return denied

  const body = await req.json()

  // Fetch current dispatch + items for event recording
  const { data: current } = await supabase.from('dispatch_orders' as any)
    .select('status, dispatch_number, customer_id, customers(name,phone,mobile), dispatch_items(job_id)')
    .eq('id', params.id).single()

  const updateData: Record<string, any> = { ...body }
  delete updateData.action

  // Status-specific timestamps
  if (body.action === 'dispatch' || body.status === 'dispatched') {
    updateData.status       = 'dispatched'
    updateData.dispatched_at = new Date().toISOString()
  }
  if (body.action === 'deliver' || body.status === 'delivered') {
    updateData.status       = 'delivered'
    updateData.delivered_at = new Date().toISOString()
  }

  const { data, error } = await supabase.from('dispatch_orders' as any)
    .update(updateData).eq('id', params.id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mirror to job timeline for key transitions
  const curr = current as any
  const newStatus = (data as any).status
  if (curr?.status !== newStatus && curr?.dispatch_items) {
    for (const item of curr.dispatch_items) {
      if (newStatus === 'dispatched') {
        await recordJobEvent({
          company_id: companyId,
          job_id:     item.job_id,
          event_type: 'status_changed',
          new_value:  `Dispatched — ${curr.dispatch_number}`,
          actor_id:   userTableId,
        }, supabase)
        // Mark job as dispatched
        await supabase.from('jobs' as any)
          .update({ status: 'dispatched' })
          .eq('id', item.job_id)
          .in('status', ['completed', 'in_progress'])
      }
      if (newStatus === 'delivered') {
        await recordJobEvent({
          company_id: companyId,
          job_id:     item.job_id,
          event_type: 'status_changed',
          new_value:  `Delivered — POD confirmed`,
          actor_id:   userTableId,
        }, supabase)
      }
    }

    // Respect the "Send WhatsApp message on dispatch" system setting. Fires
    // once per dispatch order (not once per item) when it first transitions
    // to 'dispatched'. sendWhatsApp() returns { sent: false, reason:
    // 'not_configured' } until Meta WhatsApp Cloud API credentials are added
    // as env vars — this records that outcome as a notification rather than
    // silently doing nothing, so it's visible that the setting is on but not
    // yet wired to a real provider.
    if (newStatus === 'dispatched') {
      const { data: smsSetting } = await supabase.from('system_settings' as any)
        .select('value').eq('company_id', companyId).eq('key', 'dispatch_sms').maybeSingle()

      if ((smsSetting as any)?.value === 'true') {
        const customerPhone = curr.customers?.mobile || curr.customers?.phone
        const result = await sendWhatsApp(
          customerPhone,
          `Your order ${curr.dispatch_number} has been dispatched. Thank you for choosing us.`
        )
        if (!result.sent && userTableId) {
          await notify({
            user_id: userTableId,
            company_id: companyId,
            title: 'Dispatch WhatsApp message not sent',
            message: result.reason === 'not_configured'
              ? `WhatsApp notifications are enabled in Settings but Meta WhatsApp Cloud API is not configured yet (dispatch ${curr.dispatch_number}).`
              : `Could not send dispatch WhatsApp message for ${curr.dispatch_number}: ${result.reason}`,
            type: 'warning',
          }).catch(() => {})
        }
      }
    }
  }

  return NextResponse.json({ data })
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('dispatch_orders' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false, status: 'cancelled' })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
