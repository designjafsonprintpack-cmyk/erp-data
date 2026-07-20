import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { sendEmail } from '@/lib/utils/sendEmail'
import { notify } from '@/modules/notifications/services/notificationService'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase.from('invoices' as any)
    .select('*, customers(*), invoice_items(*, jobs(job_number,job_title)), payments(*)')
    .eq('id', params.id).eq('company_id', companyId).single()

  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'finance', 'edit', supabase)
  if (denied) return denied

  const body = await req.json()
  const update: Record<string, any> = { ...body }
  delete update.action

  if (body.action === 'send') {
    update.status  = 'sent'
    update.sent_at = new Date().toISOString()
  }
  if (body.action === 'void') {
    update.status = 'void'
  }

  const { data, error } = await supabase.from('invoices' as any)
    .update(update).eq('id', params.id).eq('company_id', companyId).select('*, customers(name,email)').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Respect the "Email invoice on send" system setting — same non-blocking
  // pattern as the quotation-sent and dispatch email/WhatsApp wiring.
  if (body.action === 'send') {
    const { data: emailSetting } = await supabase.from('system_settings' as any)
      .select('value').eq('company_id', companyId).eq('key', 'invoice_email').maybeSingle()

    if ((emailSetting as any)?.value === 'true') {
      const inv = data as any
      const customerEmail = inv.customers?.email
      const result = await sendEmail(
        customerEmail || '',
        `Invoice ${inv.invoice_number} from Jafson Print Pack`,
        `<p>Dear ${inv.customers?.name || 'Customer'},</p>
         <p>Please find your invoice <b>${inv.invoice_number}</b> summary below:</p>
         <p>Total: PKR ${Number(inv.total_amount).toLocaleString()}<br/>
         Due Date: ${inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-PK') : 'N/A'}</p>
         <p>Jafson Print Pack</p>`
      )
      if (!result.sent && userTableId) {
        await notify({
          user_id: userTableId,
          company_id: companyId,
          title: 'Invoice email not sent',
          message: result.reason === 'not_configured'
            ? `Email notifications are enabled in Settings but Resend is not configured yet (invoice ${inv.invoice_number}).`
            : `Could not email invoice ${inv.invoice_number}: ${result.reason}`,
          type: 'warning',
          group_key: `email_failed:invoice:${params.id}`,
          digest_window_minutes: 1440,
        }).catch(() => {})
      }
    }
  }

  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'finance', 'delete', supabase)
  if (denied) return denied

  const { error } = await supabase.from('invoices' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false, status: 'cancelled' })
    .eq('id', params.id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
