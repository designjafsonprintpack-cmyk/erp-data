import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'

/**
 * Ek carton ke SAARE run — `get_job_family()` (132, aur 149 se sheet size bhi).
 *
 * Job Detail ye apne server component par pehle se parhta hai. Ye endpoint New
 * Job ke Repeat tab ke liye hai: wahan parent job dropdown se chuni jati hai, to
 * khandaan pehle se maloom hi nahi hota — aur form ko us khandaan ke har run ka
 * LAYOUT (ups + sheet size) dikhana hai, taake repeat chup chaap pichhle run ka
 * layout naqal na kar le.
 *
 * Company_id JWT se, RPC SECURITY INVOKER hai, to RLS bhi apni jagah lagti hai.
 */
export const GET = withErrorHandling(async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await (supabase as any)
    .rpc('get_job_family', { p_company_id: companyId, p_job_id: params.id })

  // Khali karke aage barhna yahan ghalat hai: "koi run nahi" aur "query tooti"
  // dono ek jaisi dikhti hain, aur pehli soorat mein form warning hi na de.
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [] })
})
