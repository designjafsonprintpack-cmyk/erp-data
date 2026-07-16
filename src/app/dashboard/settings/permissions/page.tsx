import { getRoles, getPermissions, buildPermissionMatrix } from '@/modules/settings/permissions/services/permissionService'
import PermissionMatrixClient from './PermissionMatrixClient'

export default async function PermissionsPage() {
  const [roles, permissions] = await Promise.all([getRoles(), getPermissions()])
  const matrix = await buildPermissionMatrix(roles, permissions)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Roles & Permissions</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          Configure what each role can access and do across all modules
        </p>
      </div>
      <PermissionMatrixClient
        roles={roles}
        permissions={permissions}
        initialMatrix={matrix}
      />
    </div>
  )
}
