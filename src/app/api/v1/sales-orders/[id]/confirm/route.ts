import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { createRepeatRun } from '@/lib/utils/createRepeatRun'

/**
 * SALES ORDER CONFIRM — aur isi par repeat lines ki jobs khud ban jati hain.
 *
 * KYUN CONFIRM PAR, SAVE PAR NAHI
 *   Mehboob: *"SO save hoty nhi conform hoty hi kero, save k bad ager koi
 *   changes yad aa gai to."* SO ab `draft` mein paida hoti hai; jab tak wo draft
 *   hai, miqdaar, size, line — sab badla ja sakta hai. Confirm dabate hi wo
 *   production ka hukm ban jati hai, aur usi lamhe jobs banti hain. Pehle SO
 *   seedha `confirmed` paida hoti thi, is liye "confirm" ka koi lamha tha hi
 *   nahi jis par kuch lataka ja sake.
 *
 * KIS LINE KI JOB KHUD BANTI HAI — aur kis ki nahi
 *   Sirf wo line jis par `repeat_of_job_id` likha ho (141). Aisi line par koi
 *   faisla baqi nahi hota: ups, sheet size, box type, die number, finishing,
 *   internal remarks — sab purani job par pehle se maujood hain, sirf naqal
 *   honi hai. Miqdaar SO se aati hai.
 *
 *   NAYE carton ki line par job JAAN BUJH KAR nahi banti. Us par `ups` chahiye,
 *   aur §4 ka pakka usool hai ke **ups hamesha estimator ka haath se diya hua
 *   input hai** — imposition/auto-nesting hamesha ke liye radd ki ja chuki hai.
 *   Ups ka andaza lagane ka matlab board ka andaza lagana hai; 110,000 boxes par
 *   ek ups ki ghalti lakhon ka board hai. Wo line "job banni baqi hai" ki fehrist
 *   mein jati hai — SO ki apni screen par, taake bhoolna mumkin na rahe.
 *
 * DOBARA DABANE PAR KUCH DOHRA NAHI HOTA
 *   Jis line ki job pehle se hai (`jobs.sales_order_item_id`) wo chhoR di jati
 *   hai. Is liye ye route pehle se confirmed SO par bhi chalaya ja sakta hai —
 *   line baad mein joRi gayi ho ya pehli dafa kuch nakaam hua ho, dono soorat
 *   mein wohi lines banti hain jo baqi hain.
 *
 * EK LINE NAKAAM HUI TO BAQI NAHI RUKTIN
 *   Har line apni jagah banti hai aur nakaami ginn kar wapas aati hai. Aadha
 *   kaam ho kar 500 dena sab se bura nateeja hota: user dobara dabata aur usay
 *   pata na chalta ke kya bana kya nahi.
 */
export const POST = withErrorHandling(async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  // SO ko confirm karna sales_orders ka `approve` hai, `create` nahi — jo likhta
  // hai wo hi confirm bhi kar de to koi doosri nazar nahi rehti.
  const denied = await requirePermission(userTableId, 'sales_orders', 'approve', supabase)
  if (denied) return denied

  const { data: soRow, error: soErr } = await supabase.from('sales_orders' as any)
    .select('id, so_number, status, required_date, sales_order_items(id, product_desc, quantity, repeat_of_job_id)')
    .eq('id', params.id).eq('company_id', companyId).maybeSingle()

  if (soErr) return NextResponse.json({ error: soErr.message }, { status: 500 })
  if (!soRow) return NextResponse.json({ error: 'Sales order not found' }, { status: 404 })

  const so = soRow as any
  if (so.status === 'cancelled') {
    return NextResponse.json({ error: 'This sales order is cancelled and cannot be confirmed.' }, { status: 409 })
  }

  const items: any[] = so.sales_order_items || []
  if (!items.length) {
    return NextResponse.json({ error: 'This sales order has no lines to confirm.' }, { status: 409 })
  }

  // Kis line ki job pehle se bani hui hai. Ek hi query — line par line poochna
  // N round trips hota, aur SO par saat line aam baat hai.
  const { data: existing, error: exErr } = await supabase.from('jobs' as any)
    .select('id, job_number, sales_order_item_id')
    .eq('company_id', companyId)
    .in('sales_order_item_id', items.map(i => i.id))
    .is('deleted_at', null)
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })

  const jobByItem = new Map<string, any>()
  for (const j of ((existing ?? []) as any[])) jobByItem.set(j.sales_order_item_id, j)

  const created: { line: string; job_number: string }[] = []
  const failed:  { line: string; reason: string }[] = []
  const pending: { line: string }[] = []

  for (const item of items) {
    if (jobByItem.has(item.id)) continue          // pehle se ban chuki
    if (!item.repeat_of_job_id) {                 // naya carton — ups chahiye
      pending.push({ line: item.product_desc })
      continue
    }

    const result = await createRepeatRun(supabase, {
      companyId,
      parentJobId: item.repeat_of_job_id,
      userTableId,
      quantity: item.quantity,
      requiredDate: so.required_date,
      // Exact repeat hai — wohi carton dobara becha gaya hai, to parent ki
      // manzoor shuda artwork isi run par aati hai aur Artwork stage khud shuru
      // ho jata hai. Bagair is ke run artwork gate par phans jata (§5).
      sameArtwork: true,
      notes: `Sales Order ${so.so_number} confirm hone par bana`,
      salesOrderId: so.id,
      salesOrderItemId: item.id,
    })

    if (result.error) failed.push({ line: item.product_desc, reason: result.error })
    else created.push({ line: item.product_desc, job_number: result.job.job_number })
  }

  // Status aakhir mein — jobs ban jaane ke baad. Ulta hota to ek nakaam line SO
  // ko confirmed chhoR jati aur banane ka koi ishara baqi na rehta.
  if (so.status === 'draft') {
    const { error: updErr } = await supabase.from('sales_orders' as any)
      .update({ status: 'confirmed', updated_by: userTableId })
      .eq('id', params.id).eq('company_id', companyId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      so_number: so.so_number,
      created,
      failed,
      pending,
      already: items.filter(i => jobByItem.has(i.id)).length,
    },
  })
})
