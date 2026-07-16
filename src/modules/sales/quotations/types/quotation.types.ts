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
  sent:      { label: 'Sent',      color: 'text-[var(--color-info)] bg-[var(--color-info)]/10 border-[var(--color-info)]/20' },
  approved:  { label: 'Approved',  color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20' },
  rejected:  { label: 'Rejected',  color: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20' },
  expired:   { label: 'Expired',   color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20' },
  converted: { label: 'Converted', color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20' },
}
