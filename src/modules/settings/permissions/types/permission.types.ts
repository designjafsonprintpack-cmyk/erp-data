export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'reject' | 'print' | 'export' | 'settings'

export const PERMISSION_ACTIONS: PermissionAction[] = [
  'view', 'create', 'edit', 'delete', 'approve', 'reject', 'print', 'export', 'settings'
]

export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
  reject: 'Reject',
  print: 'Print',
  export: 'Export',
  settings: 'Settings',
}

export const ERP_MODULES = [
  { key: 'dashboard',      label: 'Dashboard' },
  { key: 'customers',      label: 'Customers' },
  { key: 'quotations',     label: 'Quotations' },
  { key: 'sales_orders',   label: 'Sales Orders' },
  { key: 'jobs',           label: 'Jobs' },
  { key: 'artwork',        label: 'Artwork' },
  { key: 'planning',       label: 'Planning' },
  { key: 'store',          label: 'Store' },
  { key: 'board_inventory',label: 'Board Inventory' },
  { key: 'purchase',       label: 'Purchase' },
  { key: 'vendors',        label: 'Vendors' },
  { key: 'printing',       label: 'Printing' },
  { key: 'lamination',     label: 'Lamination' },
  { key: 'die_cutting',    label: 'Die Cutting' },
  { key: 'hot_foil',       label: 'Hot Foil' },
  { key: 'folder_gluing',  label: 'Folder Gluing' },
  { key: 'packing',        label: 'Packing' },
  { key: 'dispatch',       label: 'Dispatch' },
  { key: 'reports',        label: 'Reports' },
  { key: 'users',          label: 'Users' },
  { key: 'settings',       label: 'Settings' },
  { key: 'finance',        label: 'Finance' },
  { key: 'qc',             label: 'Quality Control' },
  { key: 'workflow',       label: 'Workflow' },
  { key: 'machines',       label: 'Machines' },
  { key: 'production',     label: 'Production Floor' },
  { key: 'admin',          label: 'Admin' },
] as const

export type ModuleKey = typeof ERP_MODULES[number]['key']

export interface Permission {
  id: string
  company_id: string
  module: ModuleKey
  action: PermissionAction
  label: string
  is_active: boolean
}

export interface Role {
  id: string
  company_id: string
  name: string
  slug: string
  description: string | null
  is_system_role: boolean
  is_active: boolean
}

export interface RoleWithPermissions extends Role {
  granted_permissions: string[] // permission IDs
}

// matrix[roleId][module][action] = boolean
export type PermissionMatrix = Record<string, Record<string, Record<string, boolean>>>
