import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { sequenceUpdateSchema } from '@/lib/schemas/settingsConfig'

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'edit', supabase)
  if (denied) return denied
  const parsed = await parseBody(req, sequenceUpdateSchema)
  if ('error' in parsed) return parsed.error
  const { document_type, prefix, padding } = parsed.data

  const { error } = await supabase
    .from('document_sequences' as any)
    .update({ prefix, padding })
    .eq('company_id', companyId)
    .eq('document_type', document_type)
    .eq('year', new Date().getFullYear())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
