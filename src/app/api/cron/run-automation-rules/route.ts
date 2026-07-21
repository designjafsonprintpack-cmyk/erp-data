import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { evaluateTimeBasedRules } from '@/lib/utils/automationEngine'

// Called by Vercel Cron (see vercel.json — runs once daily). Same
// CRON_SECRET pattern as send-scheduled-reports — no logged-in user when
// Vercel's scheduler fires this, so a bearer-token check replaces the
// session check, and the service-role client replaces the session-bound
// one since there's no auth session to satisfy RLS with.
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const { data: companies, error } = await supabase.from('companies' as any).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let processed = 0
  for (const c of ((companies ?? []) as any[])) {
    await evaluateTimeBasedRules(supabase, c.id)
    processed++
  }

  return NextResponse.json({ ok: true, companies_processed: processed })
})
