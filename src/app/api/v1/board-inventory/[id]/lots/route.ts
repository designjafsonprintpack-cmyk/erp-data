import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  // The job embed answers "kon sa board kis job ke liye aaya" on the Lot
  // History panel. FK-hinted on purpose: there is only one relationship to
  // jobs today (113), but an unhinted embed breaks outright the day a second
  // one is added — that is exactly what 104 did to jobs ↔ job_artworks.
  const { data, error } = await supabase.from('board_inventory_lots' as any)
    .select('*, vendors(name), jobs!board_inventory_lots_job_id_fkey(job_number, job_title)')
    .eq('company_id', companyId).eq('board_item_id', params.id).is('deleted_at', null)
    .order('received_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
})
