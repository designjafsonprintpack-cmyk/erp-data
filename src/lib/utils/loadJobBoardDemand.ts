import type { JobBoardDemand } from '@/components/jobs/JobBoardLine'

/**
 * Is job ka board — aur agar job kisi gang run mein hai to us RUN ka board.
 *
 * Gang mein board ek hi dafa nikalta hai, lead job ke naam (126), bilkul MRN ki
 * tarah. Sirf apni job ka demand parhte to har member ke sath wale ko "board ka
 * koi hisab nahi" dikhta — us board ka jo asal mein uski apni sheets par hi
 * chhap raha hai.
 *
 * Khali jawab (null) ka matlab hai job par board ki spec hi nahi (board type ya
 * sheet qty gayab), ya job cancel ho chuki hai. Dono soorton mein dikhane ko
 * kuch nahi.
 */
export async function loadJobBoardDemand(
  supabase: any,
  companyId: string,
  jobId: string,
): Promise<JobBoardDemand | null> {
  const base =
    'id, material_name, gsm, sheet_width_in, sheet_height_in, sheets_required, ' +
    'sheets_from_stock, sheets_ordered, sheets_to_purchase, status, ' +
    'jobs(job_number)'

  const read = async (id: string) => {
    const { data, error } = await supabase.from('board_demands' as any)
      .select(base)
      .eq('company_id', companyId).eq('job_id', id)
      .is('deleted_at', null).neq('status', 'cancelled')
      .maybeSingle()
    // Khata ko khali jawab mein na badlo — "koi demand nahi" aur "query ghalat
    // thi" do alag baaten hain, aur doosri ko chhupana wahi bimari hai jo
    // artwork page par 104 ke baad chali thi.
    if (error) { console.error('[job board demand] read failed', error.message); return null }
    return data as any
  }

  let row = await read(jobId)
  let ownerJobNumber: string | null = null

  if (!row) {
    const { data: membership } = await supabase.from('job_gang_members' as any)
      .select('job_gangs!inner(id, status, deleted_at, job_gang_members(job_id, deleted_at, jobs(job_number)))')
      .eq('job_id', jobId).eq('company_id', companyId).is('deleted_at', null).maybeSingle()

    const gang = (membership as any)?.job_gangs
    if (gang && !gang.deleted_at && gang.status !== 'cancelled') {
      // Wahi lead jo har jagah chunta jata hai: sab se chhota job number, tie
      // par id. Yahan dobara likha hai kyunke server component ko sirf yehi
      // ek cheez chahiye, poora GangContext nahi.
      const members = ((gang.job_gang_members ?? []) as any[]).filter(m => !m.deleted_at)
      const lead = [...members].sort((a, b) => {
        const an = a.jobs?.job_number ?? '', bn = b.jobs?.job_number ?? ''
        if (an && bn && an !== bn) return an < bn ? -1 : 1
        return a.job_id < b.job_id ? -1 : 1
      })[0]
      if (lead && lead.job_id !== jobId) {
        row = await read(lead.job_id)
        ownerJobNumber = lead.jobs?.job_number ?? null
      }
    }
  }

  if (!row) return null

  // Kaunsi PO par hai, aur kab aane ki umeed hai.
  const { data: poLines } = await supabase.from('purchase_order_items' as any)
    .select('purchase_orders(po_number, expected_date, status)')
    .eq('demand_id', row.id).eq('company_id', companyId)

  const live = ((poLines ?? []) as any[])
    .map(l => l.purchase_orders)
    .filter(Boolean)
    .filter((p: any) => p.status !== 'cancelled')

  return {
    ...row,
    owner_job_number: ownerJobNumber,
    po_numbers: Array.from(new Set(live.map((p: any) => p.po_number))),
    expected_date: live.map((p: any) => p.expected_date).filter(Boolean).sort()[0] ?? null,
  }
}

export default loadJobBoardDemand
