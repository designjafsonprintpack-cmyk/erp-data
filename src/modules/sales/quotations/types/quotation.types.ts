export interface QuotationItem {
  id: string; quotation_id: string; line_no: number; product_desc: string
  size_l: number | null; size_w: number | null; size_h: number | null
  quantity: number; no_of_colors: number | null
  unit_price: number; subtotal: number; notes: string | null; sort_order: number
}
export interface Quotation {
  id: string; company_id: string; quotation_number: string
  customer_id: string; status: string; valid_until: string | null
  discount_percent: number; notes: string | null; terms_conditions: string | null
  subtotal: number; tax_amount: number; discount_amount: number; total_amount: number
  revision: number; is_active: boolean; created_at: string; updated_at: string
  quotation_items?: QuotationItem[]
  customers?: { name: string; customer_code: string } | null
}
export type QuotationStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired' | 'converted'
export const QT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
  sent:      { label: 'Sent',      color: 'text-[var(--color-info)] bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-info)_20%,transparent)]' },
  approved:  { label: 'Approved',  color: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]' },
  rejected:  { label: 'Rejected',  color: 'text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-danger)_20%,transparent)]' },
  expired:   { label: 'Expired',   color: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)]' },
  converted: { label: 'Converted', color: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]' },
}
