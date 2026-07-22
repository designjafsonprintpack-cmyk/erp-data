// Shared types used across ALL modules
// Module-specific types live in modules/<name>/types/

export type UUID = string

export interface BaseEntity {
  id: UUID
  company_id: UUID
  created_at: string
  updated_at: string
  created_by: UUID | null
  updated_by: UUID | null
  deleted_at: string | null
  is_active: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface ApiResponse<T> {
  data: T | null
  error: string | null
  success: boolean
}

export interface SelectOption {
  label: string
  value: string
}

export type Theme = 'github-dark' | 'dark-blue' | 'dark-orange' | 'dark-green' | 'light'

export const THEMES: { value: Theme; label: string }[] = [
  { value: 'github-dark', label: 'GitHub Dark' },
  { value: 'dark-blue', label: 'Dark Blue' },
  { value: 'dark-orange', label: 'Dark Orange' },
  { value: 'dark-green', label: 'Dark Green' },
  { value: 'light', label: 'Light' },
]

export interface UserSession {
  id: UUID
  email: string
  company_id: UUID
  role: string
  department_id: UUID | null
  full_name: string
}

export class AppError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}
