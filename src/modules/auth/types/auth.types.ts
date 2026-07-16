export interface LoginCredentials {
  email: string
  password: string
}

export interface AuthUser {
  id: string
  email: string
  company_id: string
  role: string
  department_id: string | null
  full_name: string
}
