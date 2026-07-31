/**
 * Daily sweep of artwork files whose 30-day retention has run out.
 *
 * Same CRON_SECRET + service-role pattern as the other cron routes: there is no
 * logged-in user when Vercel's scheduler fires this, and the sweep has to see
 * every company's rows and every object in the bucket.
 *
 * `?dry=1` reports what WOULD be deleted and deletes nothing — how to check the
 * sweep against real data before trusting it, and how it was verified on live.
 *
 * Daily is the right cadence and also the only one Vercel's Hobby plan allows
 * (§5). Nothing here is time-critical: a file lingering one extra day past 30
 * costs nothing, and the retention window is the promise, not the sweep time.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { sweepArtworkFiles, ARTWORK_RETENTION_DAYS } from '@/lib/utils/artworkRetention'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  // Refuses outright when CRON_SECRET is unset, rather than comparing against
  // the string "Bearer undefined" — which anyone could send. The other three
  // cron routes all compare directly and therefore stand open on any
  // deployment missing the variable; flagged in CLAUDE.md, not changed here.
  // A sweep that DELETES FILES is the wrong place to inherit that.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[artwork-cleanup] CRON_SECRET is not set — refusing to run.')
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = new URL(req.url).searchParams.get('dry') === '1'
  const supabase = createSupabaseAdminClient()

  const result = await sweepArtworkFiles(supabase, { dryRun })

  // Logged as well as returned: the cron's response is only ever seen in
  // Vercel's function log, and a sweep that starts deleting the wrong thing
  // needs to be visible without re-running it.
  console.log('[artwork-cleanup]', JSON.stringify({
    retentionDays: ARTWORK_RETENTION_DAYS,
    cutoff: result.cutoff,
    scanned: result.scanned,
    deleted: result.deleted.length,
    keptLive: result.keptLive,
    keptRecentlyDeleted: result.keptRecentlyDeleted,
    keptRecentOrphan: result.keptRecentOrphan,
    warnings: result.warnings,
    dryRun: result.dryRun,
  }))

  return NextResponse.json({
    retention_days: ARTWORK_RETENTION_DAYS,
    cutoff: result.cutoff,
    scanned: result.scanned,
    deleted_count: result.deleted.length,
    // Capped: a first run on a long-neglected bucket could list thousands and
    // the count above is the number that matters.
    deleted_sample: result.deleted.slice(0, 50),
    kept_live: result.keptLive,
    kept_recently_deleted: result.keptRecentlyDeleted,
    kept_recent_orphan: result.keptRecentOrphan,
    warnings: result.warnings,
    dry_run: result.dryRun,
  })
})
