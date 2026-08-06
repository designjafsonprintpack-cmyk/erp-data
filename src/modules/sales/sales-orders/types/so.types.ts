export interface SalesOrderItem {
  id: string; sales_order_id: string; line_no: number; product_desc: string
  size_l: number | null; size_w: number | null; size_h: number | null
  quantity: number; no_of_colors: number | null
  unit_price: number; subtotal: number; notes: string | null; sort_order: number
}
export interface SalesOrder {
  id: string; company_id: string; so_number: string; customer_id: string
  quotation_id: string | null; status: string; order_date: string
  required_date: string | null; discount_percent: number
  special_instructions: string | null
  subtotal: number; tax_amount: number; discount_amount: number; total_amount: number
  is_active: boolean; created_at: string; updated_at: string
  sales_order_items?: SalesOrderItem[]
  customers?: { name: string; customer_code: string } | null
}
export type SOStatus = 'confirmed' | 'in_production' | 'completed' | 'dispatched' | 'cancelled'
export const SO_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  // Draft = abhi likhi ja rahi hai (145). Jitni dafa chaho badlo — koi job nahi
  // banti. Confirm dabate hi repeat lines ki jobs khud ban jati hain.
  draft:         { label: 'Draft',         color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
  confirmed:     { label: 'Confirmed',     color: 'text-[var(--color-info)] bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-info)_20%,transparent)]' },
  in_production: { label: 'In Production', color: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)]' },
  completed:     { label: 'Completed',     color: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]' },
  dispatched:    { label: 'Dispatched',    color: 'text-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)]' },
  cancelled:     { label: 'Cancelled',     color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
}
