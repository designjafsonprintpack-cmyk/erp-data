import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

/**
 * "Ye carton pehle chala hai ya naya hai?"
 *
 * Customer PO bhejta hai — *"Heaven 13w Bulb B22/E27, 50,000"* — aur ab tak
 * Mehboob ko khud dhoondna parta tha ke ye carton pehle chala tha ya nahi.
 * Naam se dhoondna do wajah se nakaam hota hai: `Citizen 20 Hl` aur
 * `Citizen 20 Hl.` ek doosre se nahi milte, aur `Aktive Chocolate 24 Sp.` ka
 * dobara order `Aktive 24 Sp` likha ja chuka hai — dono live par maujood hain.
 *
 * `find_repeat_candidates()` (141) ye dhoondta hai, us customer ke carton pehle
 * rakhta hai, aur ek carton ko ek hi row mein deta hai (family stem par).
 *
 * **Faisla ye route NAHI karta.** Har candidate ke sath size, ups, gsm, board
 * aur die wapas jate hain, kyunke naam 100% mil kar bhi do alag carton ho sakte
 * hain — `Aktive Chocolate 24 SP` (200×125×70) aur `24 Sp.` (200×130×73) live
 * par isi ki misaal hain. Insaan dekh kar chunta hai.
 */
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  // Jo Sales Order ki line bhar raha hai wo jobs dekh sakta ho — ye purane jobs
  // ka data hai, kisi naye darwaze se nahi aa raha.
  const denied = await requirePermission(userTableId, 'jobs', 'view', supabase)
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const customerId = searchParams.get('customer_id') || null
  const limit = Math.min(parseInt(searchParams.get('limit') || '8') || 8, 25)

  // Do haraf par poore database par trigram chalane ka koi faida nahi — natije
  // shor hote hain aur har keystroke par ek query jati hai.
  if (q.length < 3) return NextResponse.json({ data: [] })

  const { data, error } = await (supabase as any).rpc('find_repeat_candidates', {
    p_company_id: companyId,
    p_customer_id: customerId,
    p_query: q,
    p_limit: limit,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [] })
})
