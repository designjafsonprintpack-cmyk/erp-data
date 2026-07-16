import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return new NextResponse('Missing id', { status: 400 })

  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('sales_orders' as any)
    .select('*, customers(name,customer_code,phone,mobile,email), sales_order_items(*)')
    .eq('id', id)
    .maybeSingle()

  if (error) return new NextResponse(`DB Error: ${error.message}`, { status: 500 })
  if (!data) return new NextResponse(`Not found. ID: ${id}`, { status: 404 })
  const so = data as any
  const items = [...(so.sales_order_items || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
  const cust = so.customers || {}
  const subtotal = items.reduce((s: number, i: any) => s + (i.subtotal || 0), 0)
  const discount = so.discount_pct > 0 ? subtotal * so.discount_pct / 100 : 0
  const total = subtotal - discount

  const fmt = (d: string) => d ? new Date(d).toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' }) : '—'

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Sales Order — ${so.so_number}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
.page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 12mm 14mm; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 3px solid #1a56db; }
.company-name { font-size: 22px; font-weight: 800; color: #1a56db; }
.company-sub { font-size: 9px; color: #666; margin-top: 2px; }
.doc-title { font-size: 20px; font-weight: 800; text-align: right; text-transform: uppercase; }
.doc-number { font-size: 16px; font-weight: 700; color: #1a56db; font-family: monospace; text-align: right; margin-top: 2px; }
.badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 9px; font-weight: 700; text-transform: uppercase; margin-top: 4px; float: right; }
.badge-confirmed { background: #ecfdf5; color: #065f46; border: 1px solid #6ee7b7; }
.badge-draft { background: #f3f4f6; color: #6b7280; border: 1px solid #d1d5db; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.info-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; }
.info-box-title { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #6b7280; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #f3f4f6; }
.info-row { display: flex; gap: 6px; margin-bottom: 3px; }
.info-label { font-size: 9px; color: #9ca3af; width: 80px; flex-shrink: 0; }
.info-value { font-size: 10px; font-weight: 500; }
.info-value-lg { font-size: 12px; font-weight: 700; margin-bottom: 4px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
thead tr { background: #1a56db; }
thead th { padding: 7px 8px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; color: white; }
.tr { text-align: right; }
tbody td { padding: 7px 8px; border-bottom: 1px solid #f3f4f6; font-size: 10px; }
.tdr { text-align: right; }
tr:nth-child(even) td { background: #f9fafb; }
.totals { display: flex; justify-content: flex-end; margin-top: 8px; }
.totals-box { width: 220px; }
.tot-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; }
.tot-total { font-size: 13px; font-weight: 800; color: #1a56db; border-top: 2px solid #1a56db; padding-top: 6px; margin-top: 4px; }
.sig-section { margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
.sig-box { text-align: center; }
.sig-line { border-bottom: 1px solid #1a1a1a; height: 36px; margin-bottom: 4px; }
.sig-label { font-size: 9px; color: #6b7280; text-transform: uppercase; }
.footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 8px; color: #9ca3af; }
@media print { .page { padding: 10mm 12mm; } @page { size: A4; margin: 0; } }
</style>
</head>
<body>
<div class="page">
<div class="header">
  <div>
    <div class="company-name">Jafson Print Pack</div>
    <div class="company-sub">Quaid-e-Azam Street, Dhama, Lalamusa, Distt. Gujrat — Pakistan</div>
    <div class="company-sub">Tel: +92 53 7510029</div>
  </div>
  <div>
    <div class="doc-title">Sales Order</div>
    <div class="doc-number">${so.so_number}</div>
    <span class="badge badge-${so.status}">${(so.status || '').toUpperCase()}</span>
  </div>
</div>

<div class="info-grid">
  <div class="info-box">
    <div class="info-box-title">Bill To</div>
    <div class="info-value-lg">${cust.name || ''}</div>
    <div class="info-row"><span class="info-label">Code</span><span class="info-value">${cust.customer_code || ''}</span></div>
    
    ${cust.phone ? `<div class="info-row"><span class="info-label">Phone</span><span class="info-value">${cust.phone}</span></div>` : ''}
    ${cust.mobile ? `<div class="info-row"><span class="info-label">Mobile</span><span class="info-value">${cust.mobile}</span></div>` : ''}
    
  </div>
  <div class="info-box">
    <div class="info-box-title">Order Details</div>
    <div class="info-row"><span class="info-label">SO Number</span><span class="info-value" style="font-family:monospace;font-weight:700">${so.so_number}</span></div>
    <div class="info-row"><span class="info-label">Order Date</span><span class="info-value">${fmt(so.order_date || so.created_at)}</span></div>
    <div class="info-row"><span class="info-label">Required By</span><span class="info-value" style="font-weight:700;color:${so.required_date && new Date(so.required_date) < new Date(Date.now()+3*86400000) ? '#dc2626' : '#1a1a1a'}">${fmt(so.required_date)}</span></div>
    <div class="info-row"><span class="info-label">Status</span><span class="info-value" style="font-weight:700;text-transform:capitalize">${so.status}</span></div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:28px">#</th>
      <th>Description</th>
      <th style="width:90px">Size (mm)</th>
      <th class="tr" style="width:60px">Qty</th>
      <th class="tr" style="width:45px">Colors</th>
      <th class="tr" style="width:90px">Unit Price</th>
      <th class="tr" style="width:100px">Subtotal</th>
    </tr>
  </thead>
  <tbody>
    ${items.map((item: any, idx: number) => {
      const size = [item.size_l, item.size_w, item.size_h].filter(Boolean).join(' × ')
      return `<tr>
        <td style="color:#9ca3af">${idx + 1}</td>
        <td><div style="font-weight:600">${item.product_desc || ''}</div>${item.notes ? `<div style="font-size:9px;color:#9ca3af">${item.notes}</div>` : ''}</td>
        <td style="font-family:monospace">${size || '—'}</td>
        <td class="tdr" style="font-weight:600">${(item.quantity || 0).toLocaleString()}</td>
        <td class="tdr">${item.no_of_colors || '—'}</td>
        <td class="tdr">PKR ${(item.unit_price || 0).toLocaleString()}</td>
        <td class="tdr" style="font-weight:700">PKR ${(item.subtotal || 0).toLocaleString()}</td>
      </tr>`
    }).join('')}
  </tbody>
</table>

<div class="totals">
  <div class="totals-box">
    <div class="tot-row"><span style="color:#6b7280">Subtotal</span><span>PKR ${subtotal.toLocaleString()}</span></div>
    ${discount > 0 ? `<div class="tot-row"><span style="color:#6b7280">Discount (${so.discount_pct}%)</span><span style="color:#dc2626">− PKR ${discount.toLocaleString()}</span></div>` : ''}
    <div class="tot-row tot-total"><span>TOTAL</span><span>PKR ${total.toLocaleString()}</span></div>
  </div>
</div>

${so.notes || so.terms ? `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
  ${so.notes ? `<div style="border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px"><div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:4px">Notes</div><div style="font-size:10px">${so.notes}</div></div>` : ''}
  ${so.terms ? `<div style="border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px"><div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:4px">Terms</div><div style="font-size:10px">${so.terms}</div></div>` : ''}
</div>` : ''}

<div class="sig-section">
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Prepared By</div><div style="font-size:8px;color:#9ca3af">Jafson Print Pack</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Authorized By</div><div style="font-size:8px;color:#9ca3af">Management</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Customer Acceptance</div><div style="font-size:8px;color:#9ca3af">${cust.name || ''}</div></div>
</div>

<div class="footer">
  <span>Jafson Print Pack · Lalamusa, Gujrat, Pakistan</span>
  <span>${so.so_number} · Printed: ${new Date().toLocaleString('en-PK')}</span>
  <span>Jafson Print ERP</span>
</div>
</div>
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}
