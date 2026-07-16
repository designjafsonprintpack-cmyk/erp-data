export interface Company {
  id: string
  name: string
  logo_url: string | null
  ntn: string | null
  address: string | null
  is_active: boolean
  created_at: string
}

export interface Branch {
  id: string
  company_id: string
  name: string
  address: string | null
  is_head_office: boolean
  is_active: boolean
  created_at: string
}

export interface Warehouse {
  id: string
  company_id: string
  branch_id: string | null
  name: string
  location: string | null
  is_active: boolean
  created_at: string
}

export interface CompanyFormData {
  name: string
  ntn: string
  address: string
}

export interface BranchFormData {
  name: string
  address: string
  is_head_office: boolean
}

export interface WarehouseFormData {
  name: string
  location: string
  branch_id: string
}
