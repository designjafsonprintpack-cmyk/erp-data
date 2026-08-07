/**
 * Auto-fills the "Hours" box on a Production Planning machine assignment.
 *
 * The shop already knows both halves of this number, so nobody should be typing
 * it: `machines.capacity_per_hour` is the run rate and `machines.setup_hours`
 * (migration 148) is the make-ready allowance.
 *
 *     hours = setup_hours + qty / capacity_per_hour
 *
 * WHICH qty depends on what the machine actually feeds, and this is the part
 * that is easy to get wrong: a press, a die cutter, a laminator and a foiling
 * machine all consume SHEETS, so they read `jobs.sheet_qty`. A folder gluer
 * runs the individual cut blanks, so it reads `jobs.quantity` — the box count.
 * Feeding sheets to a gluer would under-estimate it by the ups factor.
 *
 * The result is a DEFAULT the planner types over, never a lock, and nothing
 * downstream reads it — so a missing capacity just means an empty box, exactly
 * as before.
 */

export interface HoursJob {
  sheet_qty?: number | null
  quantity?: number | null
}

export interface HoursMachine {
  machine_type?: string | null
  capacity_per_hour?: number | null
  setup_hours?: number | null
}

/** Machine types whose capacity_per_hour counts BOXES, not sheets. */
const BOX_FED = new Set(['foldergluing'])

/** The quantity this machine will actually run, and what that unit is called. */
function workload(job: HoursJob, machine: HoursMachine): { qty: number; unit: string } | null {
  const sheets = Number(job.sheet_qty) || 0
  const boxes = Number(job.quantity) || 0

  if (BOX_FED.has(machine.machine_type ?? '')) {
    // A press proof carries sheet_qty with quantity 0 — it has no boxes at all
    // (§4). Fall back rather than auto-fill a zero.
    if (boxes > 0) return { qty: boxes, unit: 'boxes' }
    return sheets > 0 ? { qty: sheets, unit: 'sheets' } : null
  }

  if (sheets > 0) return { qty: sheets, unit: 'sheets' }
  return boxes > 0 ? { qty: boxes, unit: 'boxes' } : null
}

/**
 * Hours for one job on one machine, rounded to the nearest 15 minutes.
 * Returns null when the machine has no capacity on file or the job has no
 * quantity yet — the caller leaves the box empty in that case.
 */
export function estimateMachineHours(job: HoursJob | null | undefined, machine: HoursMachine | null | undefined): number | null {
  if (!job || !machine) return null
  const capacity = Number(machine.capacity_per_hour) || 0
  if (capacity <= 0) return null

  const load = workload(job, machine)
  if (!load) return null

  const setup = Number(machine.setup_hours) || 0
  const total = setup + load.qty / capacity

  // Quarter-hour granularity — a plan is a day's running order, not a stopwatch.
  const rounded = Math.round(total * 4) / 4
  return rounded > 0 ? rounded : 0.25
}

/**
 * The same sum in words, shown under the row so the planner can see WHY it says
 * 3.25 and knows which number to correct if it looks wrong.
 */
export function explainMachineHours(job: HoursJob | null | undefined, machine: HoursMachine | null | undefined): string | null {
  if (!job || !machine) return null
  const capacity = Number(machine.capacity_per_hour) || 0
  if (capacity <= 0) return null

  const load = workload(job, machine)
  if (!load) return null

  const setup = Number(machine.setup_hours) || 0
  const run = `${load.qty.toLocaleString()} ${load.unit} ÷ ${capacity.toLocaleString()}/hr`
  return setup > 0 ? `${run} + ${setup}h setup` : run
}
