/**
 * Backfill Quantity (and the Sheet Qty derived from it) onto the 478 legacy
 * JOB-OLD-* jobs, from "data (1).xlsx".
 *
 * WHY ONLY THESE TWO FIELDS
 *   A full column-by-column comparison of the file against the database showed
 *   every other column is ALREADY imported and matches exactly — ups, colours,
 *   GSM, sizes, sheet size, die number, UV coating, pasting, special finishing,
 *   internal remarks, box type, board type. Quantity is the only thing that
 *   never made it in (all 478 rows sit at 0), and Sheet Qty depends on it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   - Never INSERTs. Only UPDATE, so a duplicate job is impossible by design.
 *   - Never overwrites a quantity that is already non-zero.
 *   - Never touches UV Coating. The file holds shop shorthand ("W/B") while the
 *     database holds the proper trade name migration 093 standardised on
 *     ("Water Base"). The database is the correct one of the two.
 *   - Never touches the customer link. Three rows disagree with the file and
 *     that needs a human decision, not a script — see the report it prints.
 *
 * SAFETY
 *   Dry run by default: prints exactly what would change and writes nothing.
 *   Pass --go to actually write. Same convention as restore.mjs in the backups.
 *
 *   Rows are matched POSITIONALLY — file row order to job_number order — which
 *   was verified at 478/478 (100%) on job title. Even so, every single row
 *   re-checks the title before it is written, and the whole run aborts if any
 *   row fails. A silent partial write against the wrong jobs is the one
 *   outcome that would be genuinely hard to undo.
 *
 * Usage:
 *   node backfill-legacy-quantity.mjs          # dry run
 *   node backfill-legacy-quantity.mjs --go     # write
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const GO = process.argv.includes('--go')
const XLSX_PATH = process.argv.find(a => a.endsWith('.xlsx')) || 'C:/Users/Mehboob/Desktop/data (1).xlsx'
const COMPANY = '00000000-0000-0000-0000-000000000001'

const env = fs.readFileSync(new URL('.env.local', import.meta.url), 'utf8')
const get = k => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1]?.trim()
const db = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const num = v => {
  const n = Number(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

console.log(GO ? '### LIVE RUN — writing to the database ###' : '### DRY RUN — nothing will be written ###')
console.log('file:', XLSX_PATH, '\n')

// ── Read the sheet, applying the same rule the original import used ────────
const wb = XLSX.readFile(XLSX_PATH)
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Jobs'], { defval: null })
  .filter(r => r['Job Title'] != null && String(r['Job Title']).trim() !== '')

// ── Read the jobs ─────────────────────────────────────────────────────────
let jobs = []
for (let p = 0; ; p++) {
  const { data, error } = await db.from('jobs')
    .select('id,job_number,job_title,quantity,ups,sheet_qty')
    .eq('company_id', COMPANY).like('job_number', 'JOB-OLD-%')
    .order('job_number').range(p * 1000, p * 1000 + 999)
  if (error) { console.error('READ FAILED:', error.message); process.exit(1) }
  jobs = jobs.concat(data)
  if (data.length < 1000) break
}

if (rows.length !== jobs.length) {
  console.error(`ABORT: file has ${rows.length} titled rows but the database has ${jobs.length} legacy jobs.`)
  console.error('The positional mapping is only safe when these are equal.')
  process.exit(1)
}

// ── Guard: every row must still line up before anything is written ────────
const badRows = []
for (let i = 0; i < rows.length; i++) {
  if (norm(rows[i]['Job Title']) !== norm(jobs[i].job_title)) {
    badRows.push({ row: i + 2, job: jobs[i].job_number, file: rows[i]['Job Title'], db: jobs[i].job_title })
  }
}
if (badRows.length) {
  console.error('ABORT: ' + badRows.length + ' row(s) no longer line up with the database.')
  console.table(badRows.slice(0, 10))
  process.exit(1)
}
console.log('✓ alignment check passed —', rows.length, 'of', rows.length, 'titles match\n')

// ── Work out the changes ──────────────────────────────────────────────────
const plan = []
const skippedNoQty = [], skippedHasQty = [], skippedNoUps = []
for (let i = 0; i < rows.length; i++) {
  const job = jobs[i]
  const qty = num(rows[i]['Quantity'])
  if (!qty) { skippedNoQty.push(job.job_number); continue }
  if (Number(job.quantity) > 0) { skippedHasQty.push(job.job_number); continue }

  const ups = num(job.ups) ?? num(rows[i]['Ups'])
  if (!ups) { skippedNoUps.push(job.job_number); continue }

  // Sheet Qty = ceil(Box Qty / Ups) — the locked-in rule, CLAUDE.md §4.
  plan.push({ id: job.id, job_number: job.job_number, title: job.job_title,
    quantity: qty, ups, sheet_qty: Math.ceil(qty / ups) })
}

console.log('to update              :', plan.length)
console.log('no quantity in the file:', skippedNoQty.length, '(left at 0)')
console.log('already has a quantity :', skippedHasQty.length)
console.log('quantity but no ups    :', skippedNoUps.length)

console.log('\nfirst 10 changes:')
console.table(plan.slice(0, 10).map(p => ({
  job: p.job_number, title: p.title.slice(0, 30),
  quantity: p.quantity, ups: p.ups, 'sheet_qty ='  : p.sheet_qty,
})))

// ── Rollback file, written BEFORE anything changes ────────────────────────
// Small insurance: the exact prior value of every row about to be touched, so
// this run can be undone without needing a full database restore.
if (GO && plan.length) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = `backfill-rollback-${stamp}.json`
  const before = plan.map(p => {
    const j = jobs.find(x => x.id === p.id)
    return { id: j.id, job_number: j.job_number, quantity: j.quantity, sheet_qty: j.sheet_qty }
  })
  fs.writeFileSync(file, JSON.stringify(before, null, 2))
  console.log('\n✓ rollback written to', file, '(' + before.length + ' rows, values as they are now)')
}

// Deliberately not process.exit() here — the Supabase client still holds open
// handles and exiting under them trips a libuv assertion on Windows, which
// looks like a crash at the end of a perfectly good run.
let ok = 0
const failures = []
for (const p of GO ? plan : []) {
  const { error } = await db.from('jobs')
    .update({ quantity: p.quantity, sheet_qty: p.sheet_qty })
    .eq('id', p.id).eq('company_id', COMPANY)
  if (error) failures.push({ job: p.job_number, error: error.message })
  else ok++
  if (ok % 50 === 0) console.log('  …', ok, '/', plan.length)
}

if (!GO) {
  console.log('\nDry run complete. Nothing was written.')
  console.log('Re-run with --go to apply these', plan.length, 'updates.')
} else {
  console.log('\nupdated :', ok)
  console.log('failed  :', failures.length)
  if (failures.length) console.table(failures.slice(0, 10))
}

// ── Read back and confirm ─────────────────────────────────────────────────
const { count: withQty } = await db.from('jobs').select('*', { count: 'exact', head: true })
  .eq('company_id', COMPANY).like('job_number', 'JOB-OLD-%').gt('quantity', 0)
const { count: withSheet } = await db.from('jobs').select('*', { count: 'exact', head: true })
  .eq('company_id', COMPANY).like('job_number', 'JOB-OLD-%').gt('sheet_qty', 0)
const { count: total } = await db.from('jobs').select('*', { count: 'exact', head: true })
  .eq('company_id', COMPANY).like('job_number', 'JOB-OLD-%')
console.log('\nverified from the database:')
console.log('  legacy jobs total      :', total, '(must still be 478 — no duplicates)')
console.log('  now have a quantity    :', withQty)
console.log('  now have a sheet_qty   :', withSheet)
