import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { runAiArtworkPreflight } from '@/lib/utils/aiArtworkPreflight'

export const POST = withErrorHandling(async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'artwork', 'edit', supabase)
  if (denied) return denied

  const { data: artwork } = await supabase.from('job_artworks' as any)
    .select('id, file_url, file_type, job_id, jobs(job_title, quantity, size_l, size_w, board_types(name))')
    .eq('id', params.id).eq('company_id', companyId).maybeSingle()

  if (!artwork) return NextResponse.json({ error: 'Artwork not found' }, { status: 404 })
  const art = artwork as any

  if (art.file_type && !art.file_type.toLowerCase().includes('jpeg') && !art.file_type.toLowerCase().includes('jpg')) {
    return NextResponse.json({ error: 'AI pre-flight only supports JPG artwork (matches the upload restriction).' }, { status: 400 })
  }

  // Download the actual file bytes from private Storage — this route runs
  // server-side with the service-role client, same pattern as the public
  // token routes, since we need raw bytes (not a signed URL) to send to Claude.
  const adminSupabase = createSupabaseAdminClient()
  const { data: fileBlob, error: downloadError } = await adminSupabase.storage.from('artwork').download(art.file_url)
  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: 'Could not read the artwork file from storage.' }, { status: 500 })
  }

  const arrayBuffer = await fileBlob.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  const result = await runAiArtworkPreflight(base64, 'image/jpeg', {
    jobTitle: art.jobs?.job_title || 'Unknown job',
    quantity: art.jobs?.quantity || 0,
    boardType: art.jobs?.board_types?.name || null,
    requiredWidthIn: art.jobs?.size_l ?? null,
    requiredHeightIn: art.jobs?.size_w ?? null,
  })

  if (!result.ok) {
    return NextResponse.json({ error: `AI pre-flight check could not run (${result.reason}). Nothing was saved.` }, { status: 502 })
  }

  const { data: updated, error } = await supabase.from('job_artworks' as any).update({
    ai_preflight_status: result.status,
    ai_preflight_summary: result.summary,
    ai_preflight_issues: result.issues,
    ai_preflight_checked_at: new Date().toISOString(),
    updated_by: userTableId,
  }).eq('id', params.id).eq('company_id', companyId)
    .select('id, ai_preflight_status, ai_preflight_summary, ai_preflight_issues, ai_preflight_checked_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: updated })
})
