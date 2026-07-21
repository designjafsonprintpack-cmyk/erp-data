import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { sendEmail } from '@/lib/utils/sendEmail'
import { notify } from '@/modules/notifications/services/notificationService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { quotationUpdateSchema } from '@/lib/schemas/quotation'

// Allowed quotation status transitions. 'converted' is intentionally excluded
// as a target here — it can only be reached via the dedicated /convert
// endpoint, which also creates the linked Sales Order. Allowing a direct
// PATCH to 'converted' would mark a quotation converted with no SO behind it.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft:     ['sent'],
  sent:      ['approved', 'rejected', 'expired', 'draft'],
  approved:  ['expired'],
  rejected:  ['sent', 'draft'],
  expired:   ['sent', 'draft'],
  converted: [],
}

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const { data: rawData, error } = await supabase.from('quotations' as any)
    .select('*, customers(name, customer_code, email, phone), quotation_items(*)')
    .eq('id', params.id).eq('company_id', companyId).single()
  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const data = rawData as unknown as Record<string, any>
  const result = { ...data, quotation_items: Array.isArray((data as any).quotation_items)
    ? [...(data as any).quotation_items].sort((a: any, b: any) => a.sort_order - b.sort_order) : [] }
  return NextResponse.json({ data: result })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'quotations', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, quotationUpdateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data
  const { items, ...headerBody } = body

  if (headerBody.status !== undefined) {
    if (headerBody.status === 'converted') {
      return NextResponse.json(
        { error: 'A quotation cannot be marked converted directly — use the Convert to Sales Order action instead.' },
        { status: 400 }
      )
    }

    const { data: current, error: currentErr } = await supabase.from('quotations' as any)
      .select('status').eq('id', params.id).eq('company_id', companyId).single()
    if (currentErr || !current) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })

    const currentStatus = (current as any).status as string
    if (currentStatus !== headerBody.status) {
      const allowed = ALLOWED_TRANSITIONS[currentStatus] || []
      if (!allowed.includes(headerBody.status)) {
        return NextResponse.json(
          { error: `Cannot move quotation from "${currentStatus}" to "${headerBody.status}".` +
                   (allowed.length ? ` Allowed next status(es): ${allowed.join(', ')}.` : ' This status is final.') },
          { status: 400 }
        )
      }
    }
  }

  // Snapshot the PRE-edit state as a new version whenever items or pricing
  // change — this is what lets the version-comparison view show what
  // actually changed, not just the latest numbers. A pure status change
  // (e.g. draft → sent with nothing else touched) doesn't get its own
  // version; there's nothing to compare.
  const touchesContent = items !== undefined || headerBody.discount_percent !== undefined
    || headerBody.subtotal !== undefined || headerBody.total_amount !== undefined

  if (touchesContent) {
    const { data: before } = await supabase.from('quotations' as any)
      .select('*, quotation_items(*)').eq('id', params.id).eq('company_id', companyId).single()
    if (before) {
      const { count } = await supabase.from('quotation_versions' as any)
        .select('*', { count: 'exact', head: true }).eq('quotation_id', params.id).eq('company_id', companyId)
      const b = before as any
      await supabase.from('quotation_versions' as any).insert({
        company_id: companyId,
        quotation_id: params.id,
        version_number: (count ?? 0) + 1,
        snapshot: {
          header: {
            status: b.status, subtotal: b.subtotal, discount_percent: b.discount_percent,
            discount_amount: b.discount_amount, tax_amount: b.tax_amount, total_amount: b.total_amount,
            notes: b.notes, terms_conditions: b.terms_conditions,
          },
          items: (b.quotation_items ?? []).map((i: any) => ({
            product_desc: i.product_desc, quantity: i.quantity, unit_price: i.unit_price,
            subtotal: i.subtotal, no_of_colors: i.no_of_colors, board_type_id: i.board_type_id,
          })),
        },
        created_by: userTableId,
      })
    }
  }

  const { data, error } = await supabase.from('quotations' as any).update(headerBody)
    .eq('id', params.id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Replace line items wholesale when a new set is provided — this was
  // previously silently ignored (the `items` key was passed straight into
  // the header .update() above, which has no such column, so edits to line
  // items from the edit form never actually saved).
  if (items !== undefined) {
    // ON DELETE CASCADE on quotation_item_cost_lines means deleting the
    // items here also clears their cost lines — no separate cleanup needed.
    await supabase.from('quotation_items' as any).delete().eq('quotation_id', params.id).eq('company_id', companyId)
    if (items.length) {
      const lineItems = items.map((item: any, idx: number) => {
        const { cost_lines, ...itemFields } = item
        return { ...itemFields, quotation_id: params.id, company_id: companyId, line_no: idx + 1, sort_order: idx + 1 }
      })
      const { data: insertedItems, error: itemsError } = await supabase.from('quotation_items' as any).insert(lineItems).select('id')
      if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

      const costLineRows = (insertedItems ?? []).flatMap((inserted: any, idx: number) =>
        (items[idx].cost_lines || []).map((line: any, li: number) => ({
          company_id: companyId,
          quotation_item_id: inserted.id,
          cost_item_type_id: line.cost_item_type_id || null,
          name: line.name,
          unit_basis: line.unit_basis,
          rate: line.rate,
          quantity: line.quantity,
          amount: line.amount,
          sort_order: li + 1,
        }))
      )
      if (costLineRows.length) await supabase.from('quotation_item_cost_lines' as any).insert(costLineRows)
    }
  }

  // Mint a fresh 7-day customer approval link every time the quotation is
  // (re)sent, so re-sending after edits invalidates any earlier link.
  if (headerBody.status === 'sent') {
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: withToken } = await supabase.from('quotations' as any).update({
      approval_token: token,
      approval_token_expires_at: expiresAt,
      approval_responded_at: null,
      approval_ip: null,
    }).eq('id', params.id).eq('company_id', companyId).select('*, customers(name,email)').single()

    // Respect the "Email quotation on send" system setting, same pattern as
    // "Send WhatsApp message on dispatch". sendEmail() returns
    // { sent: false, reason: 'not_configured' } until Resend credentials are
    // added as env vars — that outcome is recorded as a notification rather
    // than silently doing nothing.
    if (withToken) {
      const { data: emailSetting } = await supabase.from('system_settings' as any)
        .select('value').eq('company_id', companyId).eq('key', 'quotation_email').maybeSingle()

      if ((emailSetting as any)?.value === 'true') {
        const wt = withToken as any
        const customerEmail = wt.customers?.email
        const approvalUrl = `${req.nextUrl.origin}/approve/${wt.approval_token}`
        const result = await sendEmail(
          customerEmail || '',
          `Quotation ${wt.quotation_number} from Jafson Print Pack`,
          `<p>Dear ${wt.customers?.name || 'Customer'},</p>
           <p>Please review and respond to quotation <b>${wt.quotation_number}</b> (total: PKR ${Number(wt.total_amount).toLocaleString()}) using the link below:</p>
           <p><a href="${approvalUrl}">${approvalUrl}</a></p>
           <p>This link expires in 7 days.</p>
           <p>Jafson Print Pack</p>`
        )
        if (!result.sent && userTableId) {
          await notify({
            user_id: userTableId,
            company_id: companyId,
            title: 'Quotation email not sent',
            message: result.reason === 'not_configured'
              ? `Email notifications are enabled in Settings but Resend is not configured yet (quotation ${wt.quotation_number}).`
              : `Could not email quotation ${wt.quotation_number}: ${result.reason}`,
            type: 'warning',
            group_key: `email_failed:quotation:${params.id}`,
            digest_window_minutes: 1440,
          }).catch(() => {})
        }
      }
      return NextResponse.json({ data: withToken })
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
  const denied = await requirePermission(userTableId, 'quotations', 'delete', supabase)
  if (denied) return denied

  await supabase.from('quotations' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', params.id).eq('company_id', companyId)
  return NextResponse.json({ success: true })
})
