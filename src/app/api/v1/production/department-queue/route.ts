import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { loadStageQueue } from '@/lib/utils/loadStageQueue'

// GET — "my department's queue": every active job currently sitting at (or
// waiting to start) a stage owned by this department, split into
// Ready to Start / Blocked / In Progress. Works for any stage that has
// workflow_stages.department_id set (seeded for all of them by migration 091),
// not just machine-bound ones.
//
// Plates and MRN aren't workflow stages in this system (they're their own
// modules linked to a job by job_id, not part of job_stage_progress), so they
// don't appear here — the Plates and Store/MRN pages remain the right place.
//
// The list building itself lives in loadStageQueue(), shared with
// /api/v1/production/stage-queue so both views agree on what's ready.
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  let departmentId = searchParams.get('department_id') || ''

  // 'all' — the whole plant's live work in one list. Needed for anyone who
  // isn't tied to a single department (owner, admin, superadmin, and any user
  // whose department_id was never set), who would otherwise land on some
  // arbitrary department's empty queue and conclude the page is broken. Also
  // the only view that surfaces a stage with NO department assigned — those
  // are invisible to every per-department query by definition.
  const allDepartments = departmentId === 'all'

  if (!allDepartments && !departmentId) {
    const { data: profile } = await supabase.from('users' as any)
      .select('department_id').eq('company_id', companyId).eq('auth_user_id', user.id).maybeSingle()
    departmentId = (profile as any)?.department_id || ''
  }

  if (!allDepartments && !departmentId) {
    return NextResponse.json({ data: { department_id: null, ready: [], blocked: [], in_progress: [] } })
  }

  const queue = await loadStageQueue(supabase, companyId, {
    departmentId: allDepartments ? null : departmentId,
  })

  return NextResponse.json({
    data: { department_id: allDepartments ? 'all' : departmentId, ...queue },
  })
})
