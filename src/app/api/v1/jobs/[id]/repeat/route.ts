import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { jobRepeatSchema } from '@/lib/schemas/jobActions'
import { createRepeatRun } from '@/lib/utils/createRepeatRun'

/**
 * "Ye purani job dobara chalao" — Jobs → New Job ka Repeat tab.
 *
 * Run banane ka poora kaam ab `createRepeatRun()` mein hai, kyunki Sales Order
 * confirm hone par bhi wohi run banta hai aur specs ki fehrist do jagah rakhna
 * theek wohi bimari hai jis se CLAUDE.md §5 mana karta hai (paanch raaston mein
 * se paanchon se `internal_remarks` gir gaya tha).
 *
 * Is raaste par `sales_order_id` JAAN BUJH KAR khali rehta hai: ye kisi SO ki
 * line poori nahi kar raha, ye purani job dobara chala raha hai. SO wala raasta
 * link rakhta hai.
 */
export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'jobs', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, jobRepeatSchema)
  if ('error' in parsed) return parsed.error
  const { quantity, required_date, notes, same_artwork } = parsed.data

  const result = await createRepeatRun(supabase, {
    companyId,
    parentJobId: params.id,
    userTableId,
    quantity,
    requiredDate: required_date,
    sameArtwork: same_artwork,
    notes,
  })

  if (result.error) {
    return NextResponse.json({ error: result.error },
      { status: result.error === 'Job not found' ? 404 : 500 })
  }
  return NextResponse.json({ data: result.job })
})
