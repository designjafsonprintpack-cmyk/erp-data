import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { artworkCommentSchema } from '@/lib/schemas/artwork'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase.from('artwork_comments' as any)
    .select('*, users!artwork_comments_author_id_fkey(full_name)')
    .eq('artwork_id', params.id).eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
})

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'artwork', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, artworkCommentSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data
  if (!body.comment_text?.trim()) return NextResponse.json({ error: 'Comment text is required' }, { status: 400 })

  const { data, error } = await supabase.from('artwork_comments' as any).insert({
    company_id: companyId,
    artwork_id: params.id,
    author_type: 'staff',
    author_id: userTableId,
    comment_text: body.comment_text.trim(),
    position_x: body.position_x ?? null,
    position_y: body.position_y ?? null,
  }).select('*, users!artwork_comments_author_id_fkey(full_name)').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})
