export interface Customer {
  id: string; company_id: string; customer_code: string; name: string
  business_type: 'company' | 'individual' | 'government'
  ntn: string | null; strn: string | null; email: string | null
  phone: string | null; mobile: string | null; website: string | null
  industry: string | null; credit_limit: number; payment_terms: number
  notes: string | null; is_active: boolean; created_at: string
}
export interface CustomerContact {
  id: string; customer_id: string; name: string; designation: string | null
  email: string | null; phone: string | null; mobile: string | null
  is_primary: boolean; is_active: boolean
}
export interface CustomerAddress {
  id: string; customer_id: string; label: string
  address_type: 'billing' | 'delivery' | 'both'
  address_line1: string; address_line2: string | null
  city: string | null; country: string; is_default: boolean; is_active: boolean
}
export const INDUSTRIES = [
  'Food & Beverage','Pharmaceutical','Cosmetics & Beauty','Electronics',
  'Retail','FMCG','Textile','Agriculture','Automotive','Healthcare','Other'
]
