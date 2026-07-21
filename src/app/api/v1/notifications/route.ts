import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { notificationUpdateSchema } from '@/lib/schemas/notification'

export const GET = withErrorHandling(async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userTableId = await getUserTableId(user, supabase)
  const { data } = await supabase.from('notifications' as any)
    .select('*').eq('user_id', userTableId).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(50)
  return NextResponse.json({ data: data ?? [] })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userTableId = await getUserTableId(user, supabase)
  const parsed = await parseBody(req, notificationUpdateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data
  // No requirePermission() here deliberately — every user, regardless of
  // role, is allowed to mark THEIR OWN notifications read. The .eq('user_id',
  // userTableId) below already scopes both branches to the caller's own
  // rows, so there's no role boundary to enforce; adding one would just
  // block low-role users from clearing their own notification bell.
  if (body.all) {
    await supabase.from('notifications' as any).update({ is_read: true }).eq('user_id', userTableId).eq('is_read', false)
  } else if (body.id) {
    await supabase.from('notifications' as any).update({ is_read: true }).eq('id', body.id).eq('user_id', userTableId)
  }
  return NextResponse.json({ success: true })
})
