import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { loadStageQueue } from '@/lib/utils/loadStageQueue'
import { getProductionStage, stageMatchesSlug } from '@/lib/utils/productionStages'

// GET ?stage=printing — one shop-floor stage's own work list: every active job
// sitting at (or waiting to start) that stage, as Ready to Start / Blocked /
// In Progress.
//
// This is what the sidebar's Printing / Lamination / Die Cutting / Hot Foil /
// Folder Gluing / Packing pages read. Before this, those pages redirected to
// the machine-centric Floor view, which only ever listed jobs someone had
// manually created a production_assignment for — so a planned job never
// appeared at its own department on its own.
//
// Same loader as /api/v1/production/department-queue: identical gate rules,
// identical card data, just filtered by stage instead of department.
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const slug = searchParams.get('stage') || ''
  const def = getProductionStage(slug)
  if (!def) return NextResponse.json({ error: `Unknown production stage "${slug}"` }, { status: 400 })

  const queue = await loadStageQueue(supabase, companyId, {
    stageNameMatch: name => stageMatchesSlug(name, def),
  })

  return NextResponse.json({ data: { stage: def.slug, ...queue } })
})
