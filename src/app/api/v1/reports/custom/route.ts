import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

// Entity → table + allowlisted columns. Deliberately an allowlist, not
// arbitrary user-supplied column names — this endpoint builds a real SQL
// select from client input, so the set of selectable columns has to be
// fixed server-side regardless of what the request body claims.
const ENTITIES: Record<string, {
  table: string
  dateColumn: string
  statusColumn: string | null
  select: string
  columns: { key: string; label: string }[]
}> = {
  jobs: {
    table: 'jobs', dateColumn: 'created_at', statusColumn: 'status',
    select: 'job_number, job_title, status, priority, quantity, quoted_amount, required_date, created_at, customers(name)',
    columns: [
      { key: 'job_number', label: 'Job #' }, { key: 'job_title', label: 'Title' },
      { key: 'status', label: 'Status' }, { key: 'priority', label: 'Priority' },
      { key: 'quantity', label: 'Quantity' }, { key: 'quoted_amount', label: 'Quoted Amount' },
      { key: 'required_date', label: 'Required Date' }, { key: 'created_at', label: 'Created' },
      { key: 'customer_name', label: 'Customer' },
    ],
  },
  invoices: {
    table: 'invoices', dateColumn: 'invoice_date', statusColumn: 'status',
    select: 'invoice_number, status, invoice_date, due_date, total_amount, paid_amount, balance_due, customers(name)',
    columns: [
      { key: 'invoice_number', label: 'Invoice #' }, { key: 'status', label: 'Status' },
      { key: 'invoice_date', label: 'Invoice Date' }, { key: 'due_date', label: 'Due Date' },
      { key: 'total_amount', label: 'Total' }, { key: 'paid_amount', label: 'Paid' },
      { key: 'balance_due', label: 'Balance Due' }, { key: 'customer_name', label: 'Customer' },
    ],
  },
  customers: {
    table: 'customers', dateColumn: 'created_at', statusColumn: 'pipeline_stage',
    select: 'customer_code, name, email, phone, pipeline_stage, credit_limit, lead_source, created_at',
    columns: [
      { key: 'customer_code', label: 'Code' }, { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
      { key: 'pipeline_stage', label: 'Pipeline Stage' }, { key: 'credit_limit', label: 'Credit Limit' },
      { key: 'lead_source', label: 'Lead Source' }, { key: 'created_at', label: 'Created' },
    ],
  },
  quotations: {
    table: 'quotations', dateColumn: 'created_at', statusColumn: 'status',
    select: 'quotation_number, status, total_amount, valid_until, created_at, customers(name)',
    columns: [
      { key: 'quotation_number', label: 'Quotation #' }, { key: 'status', label: 'Status' },
      { key: 'total_amount', label: 'Total' }, { key: 'valid_until', label: 'Valid Until' },
      { key: 'created_at', label: 'Created' }, { key: 'customer_name', label: 'Customer' },
    ],
  },
  purchase_orders: {
    table: 'purchase_orders', dateColumn: 'order_date', statusColumn: 'status',
    select: 'po_number, status, order_date, total_amount, vendors(name)',
    columns: [
      { key: 'po_number', label: 'PO #' }, { key: 'status', label: 'Status' },
      { key: 'order_date', label: 'Order Date' }, { key: 'total_amount', label: 'Total' },
      { key: 'vendor_name', label: 'Vendor' },
    ],
  },
}

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('meta') === 'entities') {
    // Lets the UI build its entity/column picker without hardcoding it twice.
    return NextResponse.json({
      data: Object.fromEntries(Object.entries(ENTITIES).map(([key, e]) => [key, e.columns])),
    })
  }
  return NextResponse.json({ error: 'Use POST to run a custom report' }, { status: 400 })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'reports', 'view', supabase)
  if (denied) return denied

  const body = await req.json()
  const entityConfig = ENTITIES[body.entity]
  if (!entityConfig) return NextResponse.json({ error: 'Unknown report entity' }, { status: 400 })

  let q = supabase.from(entityConfig.table as any)
    .select(entityConfig.select, { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (body.date_from) q = q.gte(entityConfig.dateColumn, body.date_from)
  if (body.date_to)   q = q.lte(entityConfig.dateColumn, body.date_to)
  if (body.status && entityConfig.statusColumn) q = q.eq(entityConfig.statusColumn, body.status)

  const { data, error, count } = await q.order(entityConfig.dateColumn, { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten the joined customer/vendor name so the client doesn't need to
  // know each entity's particular join shape.
  const flattened = (data ?? []).map((row: any) => {
    const { customers, vendors, ...rest } = row
    return { ...rest, customer_name: customers?.name, vendor_name: vendors?.name }
  })

  return NextResponse.json({ data: flattened, total: count ?? 0, columns: entityConfig.columns })
})
