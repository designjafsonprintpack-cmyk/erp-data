import type { SupabaseClient } from '@supabase/supabase-js'
import { notify } from '@/modules/notifications/services/notificationService'
import { sendEmail } from '@/lib/utils/sendEmail'

/**
 * Evaluates the two time-based automation rule types (job_on_hold_duration,
 * invoice_overdue) for one company. Called from the daily cron route —
 * same non-blocking, best-effort spirit as the other background jobs in
 * this app (a failure here shouldn't take down the whole cron run for
 * every other company). new_customer is NOT evaluated here — it's event-
 * triggered directly from the customer-creation route instead, since
 * "new customer" is inherently immediate, not something to poll for.
 */
export async function evaluateTimeBasedRules(supabase: SupabaseClient, companyId: string): Promise<void> {
  const { data: rules } = await supabase.from('automation_rules' as any)
    .select('id, rule_type, config')
    .eq('company_id', companyId).eq('is_active', true).is('deleted_at', null)
    .in('rule_type', ['job_on_hold_duration', 'invoice_overdue'])

  for (const rule of ((rules ?? []) as any[])) {
    try {
      if (rule.rule_type === 'job_on_hold_duration') {
        await runJobOnHoldRule(supabase, companyId, rule)
      } else if (rule.rule_type === 'invoice_overdue') {
        await runInvoiceOverdueRule(supabase, companyId, rule)
      }
      await supabase.from('automation_rules' as any).update({ last_run_at: new Date().toISOString() }).eq('id', rule.id)
    } catch { /* one rule failing shouldn't block the others */ }
  }
}

async function runJobOnHoldRule(supabase: SupabaseClient, companyId: string, rule: any) {
  const thresholdDays = Number(rule.config?.threshold_days ?? 2)
  const cutoff = new Date(Date.now() - thresholdDays * 86400000).toISOString()

  const { data: jobs } = await supabase.from('jobs' as any)
    .select('id, job_number, job_title, hold_started_at')
    .eq('company_id', companyId).eq('is_on_hold', true).is('deleted_at', null)
    .not('hold_started_at', 'is', null)
    .lt('hold_started_at', cutoff)

  if (!jobs?.length) return

  const { data: recipients } = await supabase.from('users' as any)
    .select('id').eq('company_id', companyId).eq('is_active', true).eq('role', 'superadmin')

  for (const job of (jobs as any[])) {
    const daysOnHold = Math.floor((Date.now() - new Date(job.hold_started_at).getTime()) / 86400000)
    for (const r of ((recipients ?? []) as any[])) {
      await notify({
        user_id: r.id, company_id: companyId,
        title: 'Job stuck on hold',
        message: `${job.job_number} — ${job.job_title} has been on hold for ${daysOnHold} days.`,
        type: 'warning', link_url: `/dashboard/jobs/${job.id}`,
        group_key: `automation:job_on_hold:${job.id}`,
      }).catch(() => null)
    }
    await supabase.from('automation_rule_runs' as any).insert({
      company_id: companyId, rule_id: rule.id, triggered_for: job.job_number,
      action_taken: `Notified superadmins — on hold ${daysOnHold} days`,
    })
  }
}

async function runInvoiceOverdueRule(supabase: SupabaseClient, companyId: string, rule: any) {
  const { data: invoices } = await supabase.from('invoices' as any)
    .select('id, invoice_number, balance_due, due_date, customers(name, email)')
    .eq('company_id', companyId).is('deleted_at', null)
    .gt('balance_due', 0)
    .lt('due_date', new Date().toISOString().slice(0, 10))
    .not('status', 'in', '("paid","cancelled","void")')

  if (!invoices?.length) return

  const { data: companyRow } = await supabase.from('companies' as any).select('name').eq('id', companyId).maybeSingle()
  const companyName = (companyRow as any)?.name || 'Jafson Print Pack'

  for (const inv of (invoices as any[])) {
    const email = inv.customers?.email
    if (!email) continue
    const result = await sendEmail(
      email,
      `Payment Reminder — Invoice ${inv.invoice_number}`,
      `<p>Dear ${inv.customers?.name || 'Customer'},</p>
       <p>This is a reminder that invoice <b>${inv.invoice_number}</b> has an outstanding balance of PKR ${Number(inv.balance_due).toLocaleString()}, past its due date of ${inv.due_date}.</p>
       <p>Please arrange payment at your earliest convenience.</p>
       <p>${companyName}</p>`
    )
    await supabase.from('automation_rule_runs' as any).insert({
      company_id: companyId, rule_id: rule.id, triggered_for: inv.invoice_number,
      action_taken: result.sent ? 'Reminder email sent' : `Email not sent (${result.reason})`,
    })
  }
}

/**
 * Event-triggered (not cron-based) — call this right after a customer row
 * is successfully inserted. Non-blocking, same contract as
 * checkLowStockAndNotify — a failure here must never fail the customer
 * creation itself.
 */
export async function runNewCustomerRule(supabase: SupabaseClient, companyId: string, customerId: string, customerName: string): Promise<void> {
  const { data: rule } = await supabase.from('automation_rules' as any)
    .select('id').eq('company_id', companyId).eq('rule_type', 'new_customer').eq('is_active', true).is('deleted_at', null).maybeSingle()
  if (!rule) return

  const { data: recipients } = await supabase.from('users' as any)
    .select('id, departments(name)')
    .eq('company_id', companyId).eq('is_active', true)

  const salesUsers = ((recipients ?? []) as any[]).filter(u => (u.departments as any)?.name === 'Sales')
  for (const u of salesUsers) {
    await notify({
      user_id: u.id, company_id: companyId,
      title: 'New customer added',
      message: `${customerName} was just added as a new customer.`,
      type: 'info', link_url: `/dashboard/customers/${customerId}`,
      group_key: `automation:new_customer:${customerId}`,
    }).catch(() => null)
  }

  await supabase.from('automation_rule_runs' as any).insert({
    company_id: companyId, rule_id: (rule as any).id, triggered_for: customerName,
    action_taken: `Notified ${salesUsers.length} Sales user(s)`,
  })
}
