// Generic settings CRUD API — units, currencies, taxes
import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'

const VALID: Record<string, string> = { units: 'units', currencies: 'currencies', taxes: 'taxes' }

export async function GET(_: NextRequest, { params }: { params: { resource: string } }) {
  const table = VALID[params.resource]
  if (!table) return NextResponse.json({ error: 'Invalid resource' }, { status: 400 })
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const { data, error } = await supabase.from(table as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest, { params }: { params: { resource: string } }) {
  const table = VALID[params.resource]
  if (!table) return NextResponse.json({ error: 'Invalid resource' }, { status: 400 })
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const body = await req.json()
  const { data, error } = await supabase.from(table as any).insert({ ...body, company_id: companyId }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: { params: { resource: string } }) {
  const table = VALID[params.resource]
  if (!table) return NextResponse.json({ error: 'Invalid resource' }, { status: 400 })
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const { id, ...fields } = await req.json()
  const { data, error } = await supabase.from(table as any).update(fields).eq('id', id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest, { params }: { params: { resource: string } }) {
  const table = VALID[params.resource]
  if (!table) return NextResponse.json({ error: 'Invalid resource' }, { status: 400 })
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const { id } = await req.json()
  const { error } = await supabase.from(table as any).update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
