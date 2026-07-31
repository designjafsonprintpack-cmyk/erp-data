import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { materialTypeSchema, materialTypeUpdateSchema } from '@/lib/schemas/settingsConfig'
import { REFERENCE_DATA_CACHE_HEADERS } from '@/lib/utils/cacheHeaders'
import { guardDuplicateName } from '@/lib/utils/duplicateName'

const VALID_TABLES: Record<string, string> = {
  board:      'board_types',
  paper:      'paper_types',
  ink:        'ink_types',
  glue:       'glue_types',
  foil:       'foil_types',
  lamination: 'lamination_types',
  coating:    'coating_types',
  box:        'box_types',
}

// What each one is called in the duplicate message. A master list that grows a
// second "Ecano"/"Econo Board" is how 12 board descriptions ended up matching
// no board type at all.
const NOUNS: Record<string, string> = {
  board:      'board type',
  paper:      'paper type',
  ink:        'ink type',
  glue:       'glue type',
  foil:       'foil type',
  lamination: 'lamination type',
  coating:    'coating type',
  box:        'box type',
}

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { type: string } }) {
  const table = VALID_TABLES[params.type]
  if (!table) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase.from(table as any).select('*').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { headers: REFERENCE_DATA_CACHE_HEADERS })
})

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { type: string } }) {
  const table = VALID_TABLES[params.type]
  if (!table) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'create', supabase)
  if (denied) return denied
  const parsed = await parseBody(req, materialTypeSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const dupe = await guardDuplicateName(supabase, NOUNS[params.type] ?? 'record', {
    table, companyId, name: (body as any).name,
  })
  if (dupe) return dupe

  const { data, error } = await supabase.from(table as any).insert({ ...body, company_id: companyId }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { type: string } }) {
  const table = VALID_TABLES[params.type]
  if (!table) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, materialTypeUpdateSchema)
  if ('error' in parsed) return parsed.error
  const { id, ...fields } = parsed.data

  if ((fields as any).name !== undefined) {
    const dupe = await guardDuplicateName(supabase, NOUNS[params.type] ?? 'record', {
      table, companyId, name: (fields as any).name, excludeId: id,
    })
    if (dupe) return dupe
  }

  const { data, error } = await supabase.from(table as any).update(fields).eq('id', id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest, { params }: { params: { type: string } }) {
  const table = VALID_TABLES[params.type]
  if (!table) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'delete', supabase)
  if (denied) return denied

  const { id } = await req.json()
  const { error } = await supabase.from(table as any).update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
