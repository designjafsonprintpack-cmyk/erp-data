import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'

const VALID_TABLES: Record<string, string> = {
  board:      'board_types',
  paper:      'paper_types',
  ink:        'ink_types',
  glue:       'glue_types',
  foil:       'foil_types',
  lamination: 'lamination_types',
}

export async function GET(_: NextRequest, { params }: { params: { type: string } }) {
  const table = VALID_TABLES[params.type]
  if (!table) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from(table as any).select('*').is('deleted_at', null).eq('is_active', true).order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest, { params }: { params: { type: string } }) {
  const table = VALID_TABLES[params.type]
  if (!table) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const body = await req.json()
  const { data, error } = await supabase.from(table as any).insert({ ...body, company_id: companyId }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: { params: { type: string } }) {
  const table = VALID_TABLES[params.type]
  if (!table) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...fields } = await req.json()
  const { data, error } = await supabase.from(table as any).update(fields).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest, { params }: { params: { type: string } }) {
  const table = VALID_TABLES[params.type]
  if (!table) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  const { error } = await supabase.from(table as any).update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
