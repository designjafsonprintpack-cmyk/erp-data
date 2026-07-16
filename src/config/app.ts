export const APP_CONFIG = {
  name: process.env.NEXT_PUBLIC_APP_NAME || 'Jafson Print ERP',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  version: '1.0.0',
} as const

export const SIDEBAR_COLLAPSED_KEY = 'erp_sidebar_collapsed'
export const THEME_KEY = 'erp_theme'
export const DEFAULT_THEME = 'github-dark' as const

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
} as const

export const UPLOAD = {
  MAX_FILE_SIZE_MB: 50,
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
} as const
