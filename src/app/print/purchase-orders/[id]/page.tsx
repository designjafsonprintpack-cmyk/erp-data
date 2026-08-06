import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { notFound } from 'next/navigation'
import { formatDate } from '@/lib/utils/format'

/**
 * Purchase Order — wo kaghaz jo VENDOR ke paas jata hai.
 *
 * Ye page is liye bana ke Excel export vendor ko bhejne ke qabil nahi tha: wo
 * har PO ki ek satr nikalta hai (number, vendor, total, aur "Items: 6") — yani
 * kaunsa board, kitna, kis size ka, kuch nahi. Mehboob ne khol kar dekha to
 * "kuch nahi aaya" — bilkul theek, us mein woh cheez thi hi nahi jo vendor ko
 * chahiye.
 *
 * **RATE IKHTIYARI HAI.** Mehboob: *"agar rate per kg likhna chahun to theek,
 * na bhi likhun to bhi theek."* Is liye paise wale teeno column — rate, amount
 * aur total — sirf tab chhapte hain jab kisi line par waqai rate likha ho.
 * Warna kaghaz saaf reh jata hai: sirf kya chahiye aur kitna. Sifar ki qatar
 * chhapna us se bura hai ke rate na chhape — vendor samajhta hai ke maal muft
 * maanga ja raha hai.
 *
 * Sales Order ke print page ki tarah ye money-gated NAHI hai: ye vendor ko
 * bhejne ke liye hai, aur jo shakhs PO bana sakta hai wo usay bhej bhi sakta
 * hai. Rate wahin se aata hai jo PO par pehle se likha hai — ye page koi naya
 * bhaao nahi dikhata.
 *
 * §3 ke mutabiq: plain HTML/CSS, koi Tailwind nahi, aur hardcoded hex —
 * kaghaz theme ke peechay nahi chalta.
 */
export default async function PrintPurchaseOrder({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()

  const { data } = await supabase
    .from('purchase_orders' as any)
    .select('*, vendors(name,vendor_code,contact_person,phone,mobile,email,address,ntn), '
      + 'purchase_order_items(*, jobs(job_number,job_title), board_inventory(sheets_per_packet))')
    .eq('id', params.id)
    .maybeSingle()

  if (!data) notFound()
  const po = data as any
  const items = [...(po.purchase_order_items || [])].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const v = po.vendors || {}

  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : null
  const { data: companyRow } = companyId
    ? await supabase.from('companies' as any).select('name, address, ntn').eq('id', companyId).maybeSingle()
    : { data: null }
  const companyName = (companyRow as any)?.name || 'Jafson Print Pack'
  const companyAddress = (companyRow as any)?.address || ''
  const companyNtn = (companyRow as any)?.ntn || ''

  // Yahi wo faisla hai. Ek bhi line par rate ho to paise ke column aa jate hain;
  // koi bhi na ho to poora kaghaz bagair paison ke chhapta hai.
  const priced = items.some((i: any) => Number(i.unit_price) > 0)

  const num = (n: any, d = 0) =>
    Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d })

  // Vendor packets mein bechta hai; press sheets mein ginti hai. Kaghaz par dono
  // hon to na order ghalat samjha jata hai na delivery.
  const sheetsOf = (i: any) =>
    Number(i.quantity || 0) * Number(i.board_inventory?.sheets_per_packet ?? 100)

  const RATE_LABEL: Record<string, string> = { kg: 'per kg', packet: 'per packet', unit: 'per unit' }

  return (
    <html>
      <head>
        <title>Purchase Order — {po.po_number}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 12px; color: #1f2328; background: white; }
          .page { width: 210mm; min-height: 297mm; padding: 15mm; margin: 0 auto; display: flex; flex-direction: column; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #0969da; margin-bottom: 16px; }
          .logo { font-size: 18px; font-weight: 700; color: #0969da; }
          .company-sub { font-size: 10px; color: #57606a; margin-top: 3px; line-height: 1.5; max-width: 70mm; }
          .doc-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #57606a; text-align: right; }
          .doc-number { font-size: 22px; font-weight: 800; font-family: monospace; color: #0969da; text-align: right; }
          .doc-meta { font-size: 11px; color: #57606a; text-align: right; margin-top: 4px; line-height: 1.6; }
          .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 16px; }
          .party-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #57606a; border-bottom: 1px solid #d0d7de; padding-bottom: 4px; margin-bottom: 6px; }
          .party-name { font-size: 13px; font-weight: 700; }
          .party-line { font-size: 11px; color: #57606a; line-height: 1.6; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #57606a; background: #f6f8fa; border: 1px solid #d0d7de; padding: 6px 8px; text-align: left; }
          td { border: 1px solid #d0d7de; padding: 7px 8px; vertical-align: top; }
          .r { text-align: right; }
          .c { text-align: center; }
          /* Board ka naam, gsm aur sheet size — EK hi lakeer, ek hi font,
             bold aur bara. Vendor ko yehi cheez parhni hai; pehle ye do alag
             sizon mein bant kar chhoti par jaa rahi thi. */
          .desc { font-size: 13px; font-weight: 700; letter-spacing: 0.01em; }
          .spec { font-size: 10px; color: #57606a; margin-top: 3px; }
          .sheets { font-size: 10px; color: #57606a; }
          .totals { margin-left: auto; width: 70mm; }
          .totals td { border: none; padding: 3px 0; font-size: 12px; }
          .totals .grand td { border-top: 2px solid #1f2328; padding-top: 6px; font-size: 14px; font-weight: 800; }
          .note { font-size: 11px; color: #57606a; margin-bottom: 10px; line-height: 1.6; }
          .norate { font-size: 11px; color: #82071e; background: #ffebe9; border: 1px solid #ff8182; border-radius: 4px; padding: 8px 10px; margin-bottom: 12px; }
          .terms-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #57606a; margin-bottom: 4px; }
          .foot { margin-top: auto; padding-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
          .sign { border-top: 1px solid #1f2328; padding-top: 5px; font-size: 10px; color: #57606a; }
          @media print { @page { size: A4; margin: 0; } .page { padding: 12mm; } }
        `}</style>
      </head>
      <body>
        <div className="page">
          <div className="header">
            <div>
              <div className="logo">{companyName}</div>
              <div className="company-sub">
                {companyAddress}
                {companyNtn ? <><br />NTN: {companyNtn}</> : null}
              </div>
            </div>
            <div>
              <div className="doc-title">Purchase Order</div>
              <div className="doc-number">{po.po_number}</div>
              <div className="doc-meta">
                Date: {formatDate(po.order_date)}
                {po.expected_date ? <><br />Delivery required by: <strong>{formatDate(po.expected_date)}</strong></> : null}
              </div>
            </div>
          </div>

          <div className="parties">
            <div>
              <div className="party-title">Supplier</div>
              <div className="party-name">{v.name || '—'}</div>
              {v.contact_person && <div className="party-line">Attn: {v.contact_person}</div>}
              {v.address && <div className="party-line">{v.address}</div>}
              {(v.phone || v.mobile) && <div className="party-line">{[v.phone, v.mobile].filter(Boolean).join(' · ')}</div>}
              {v.email && <div className="party-line">{v.email}</div>}
              {v.ntn && <div className="party-line">NTN: {v.ntn}</div>}
            </div>
            <div>
              <div className="party-title">Deliver To</div>
              <div className="party-name">{companyName}</div>
              {companyAddress && <div className="party-line">{companyAddress}</div>}
            </div>
          </div>

          {/* Rate na ho to vendor ko saaf batao ke bhaao us se poocha ja raha
              hai. Warna khali khana "muft" parha ja sakta hai. */}
          {!priced && (
            <div className="norate">
              Rate is not quoted on this order — please confirm your rate against each item before supplying.
            </div>
          )}

          <table>
            <thead>
              <tr>
                <th style={{ width: '6%' }} className="c">#</th>
                <th>Material</th>
                <th style={{ width: '14%' }} className="r">Quantity</th>
                {priced && <th style={{ width: '16%' }} className="r">Rate</th>}
                {priced && <th style={{ width: '16%' }} className="r">Amount</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((i: any, idx: number) => (
                <tr key={i.id}>
                  <td className="c">{idx + 1}</td>
                  <td>
                    {/* Board type + gsm + sheet size ek hi bold lakeer mein —
                        vendor isi se board pehchanta hai. */}
                    <div className="desc">
                      {[i.description, i.specification].filter(Boolean).join(' · ')}
                    </div>
                    {/* Job ka NAAM, chhote haraf mein — number nahi. Number
                        vendor ke kisi kaam ka nahi; naam se hamara apna store
                        maal aane par jor leta hai. */}
                    {i.jobs?.job_title && <div className="spec">{i.jobs.job_title}</div>}
                  </td>
                  <td className="r">
                    <div>{num(i.quantity, 2)} packets</div>
                    <div className="sheets">{num(sheetsOf(i))} sheets</div>
                  </td>
                  {priced && (
                    <td className="r">
                      {Number(i.unit_price) > 0
                        ? <>{num(i.unit_price, 2)}<div className="sheets">{RATE_LABEL[i.rate_basis] ?? 'per packet'}</div></>
                        : <span style={{ color: '#82071e' }}>to be confirmed</span>}
                    </td>
                  )}
                  {priced && (
                    <td className="r">{Number(i.subtotal) > 0 ? num(i.subtotal, 2) : '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {priced && (
            <table className="totals">
              <tbody>
                <tr><td>Subtotal</td><td className="r">{num(po.subtotal, 2)}</td></tr>
                {Number(po.tax_amount) > 0 && (
                  <tr><td>Tax</td><td className="r">{num(po.tax_amount, 2)}</td></tr>
                )}
                <tr className="grand"><td>Total</td><td className="r">{num(po.total_amount, 2)}</td></tr>
              </tbody>
            </table>
          )}

          {(po.terms || po.notes) && (
            <div style={{ marginTop: 14 }}>
              <div className="terms-title">Terms &amp; Notes</div>
              {po.terms && <div className="note">{po.terms}</div>}
              {po.notes && <div className="note">{po.notes}</div>}
            </div>
          )}

          <div className="foot">
            <div className="sign">Prepared by — {companyName}</div>
            <div className="sign">Supplier acknowledgement &amp; date</div>
          </div>
        </div>
        {/* Print dialog khud khul jaye — Mehboob: *"jahan par bhi print ho,
            print dialog open hona chahiye, dobara Ctrl+P na karna pare."*
            Job Card aur Sales Order par ye pehle se tha; ye chaar page reh gaye
            the.
            window.onload, DOMContentLoaded nahi: dialog tab khule jab tasveerein
            aur styles aa chuki hon, warna preview — aur kaghaz — adhoora chhap
            sakta hai. */}
        <script dangerouslySetInnerHTML={{ __html: `window.onload = function() { window.print(); }` }} />
      </body>
    </html>
  )
}
