export type JobStatus = 'new' | 'in_progress' | 'on_hold' | 'completed' | 'dispatched' | 'cancelled'
export type JobPriority = 'low' | 'normal' | 'high' | 'urgent'
export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'
export type GrainDirection = 'long_grain' | 'short_grain'
export type EventType =
  | 'created' | 'status_changed' | 'stage_started' | 'stage_completed'
  | 'stage_skipped' | 'hold_started' | 'hold_ended' | 'remark_added'
  | 'artwork_uploaded' | 'repeat_created' | 'assigned' | 'priority_changed'
  | 'wastage_recorded' | 'plate_assigned' | 'plate_returned' | 'artwork_status_changed'
  | 'ink_recorded'
  // Press proofing (104): 'proof_created' when a round is pulled,
  // 'proof_decided' when the customer approves it or asks for changes.
  | 'proof_created' | 'proof_decided'
  // Gang runs (126): ganging rewrites a job's ups, its quantity AND its Sales
  // Order line, so both directions leave a trail. This union and the
  // job_stage_events CHECK must be widened TOGETHER — 104 widened neither and
  // the audit trail silently lost every press proof until 108.
  | 'gang_created' | 'gang_removed'

export const GRAIN_DIRECTION_CONFIG: Record<GrainDirection, { label: string }> = {
  long_grain:  { label: 'Long Grain' },
  short_grain: { label: 'Short Grain' },
}

export const JOB_STATUS_CONFIG: Record<JobStatus, { label: string; color: string; dot: string }> = {
  new:         { label: 'New',         color: 'text-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-accent)_30%,transparent)]',      dot: 'bg-[var(--color-accent)]' },
  in_progress: { label: 'In Progress', color: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)]',   dot: 'bg-[var(--color-warning)]' },
  on_hold:     { label: 'On Hold',     color: 'text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)]',      dot: 'bg-[var(--color-danger)]' },
  completed:   { label: 'Completed',   color: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)]',   dot: 'bg-[var(--color-success)]' },
  dispatched:  { label: 'Dispatched',  color: 'text-[var(--color-info)] bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-info)_30%,transparent)]',            dot: 'bg-[var(--color-info)]' },
  cancelled:   { label: 'Cancelled',   color: 'text-[var(--color-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]',        dot: 'bg-[var(--color-muted)]' },
}

/**
 * Jo job abhi SHURU nahi hui, uski chip us ka KIND batati hai — "New" nahi.
 *
 * Mehboob: *"is say confusion ho gi ke yeh New hay — repeat kerny pr Repeat ho
 * aur repeat with change per Repeat with Changes ho, taake sab ko pata chal
 * jaye."* Aur wo theek hai: `status = 'new'` ka matlab sirf itna hai ke abhi
 * tak koi stage shuru nahi hui (workflow route: *"First activity on the job
 * takes it out of 'new'"*), magar chip par "New" parh kar ye lagta hai ke ye
 * pehli dafa ka kaam hai — halanke -R2 wali job dobara chal rahi hoti hai.
 *
 * Kaam shuru hote hi chip wapas asli status par aa jati hai (In Progress, On
 * Hold…), kyunke us waqt sab se zaroori sawal ye hota hai ke job KAHAN hai.
 * Repeat hone ki pehchan phir bhi rehti hai: number ka `-R2` (§4 — ek carton ka
 * ek hi number), list ka nishaan, aur Job Detail ka "Run 2 of 2".
 *
 * `repeat_kind === 'changed'` ko warning ka rang mila hai, mehez rawadari se
 * nahi: badle hue repeat par purani plates dobara lagti hain aur wo nayi
 * artwork se mel na khati hon — workflow route wahan alag se tanbeeh karta hai.
 */
export interface JobKindFields {
  status: string
  is_repeat?: boolean | null
  repeat_kind?: string | null
  job_kind?: string | null
}

export type JobChip = { label: string; color: string; dot: string }

/**
 * Job par kya likhna hai — ek hi jagah tay hota hai.
 *
 * Screen ki chip (`jobStatusChip`) aur chhapi hui Job Card dono yahi qaida
 * parhte hain, magar rang apna apna rakhte hain: print pages hardcoded hex par
 * chalte hain aur theme ko follow NAHI karte (§3), kyunke wo kaghaz par jaate
 * hain. Sirf usool sanjha hai, styling nahi — warna do jagah ek hi job do naam
 * se pukari jati.
 */
export type JobDisplayState = JobStatus | 'repeat' | 'repeat_changed' | 'proof'

export function jobDisplayState(j: JobKindFields): JobDisplayState {
  if (j.status !== 'new') return (j.status as JobStatus)
  if (j.job_kind === 'proofing') return 'proof'
  if (j.is_repeat) return j.repeat_kind === 'changed' ? 'repeat_changed' : 'repeat'
  return 'new'
}

/** Wahi lafz jo screen par dikhte hain; Job Card inhein BARE HAROOF mein chhapti hai. */
export const JOB_DISPLAY_LABEL: Record<JobDisplayState, string> = {
  new: 'New',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  dispatched: 'Dispatched',
  cancelled: 'Cancelled',
  repeat: 'Repeat',
  repeat_changed: 'Repeat with Changes',
  proof: 'Proof',
}

export function jobStatusChip(j: JobKindFields): JobChip {
  const base = JOB_STATUS_CONFIG[j.status as JobStatus] || JOB_STATUS_CONFIG.new
  const state = jobDisplayState(j)
  if (state === j.status) return base

  if (state === 'proof') {
    return { label: JOB_DISPLAY_LABEL.proof, color: base.color, dot: base.dot }
  }
  return state === 'repeat_changed'
    ? {
        label: JOB_DISPLAY_LABEL.repeat_changed,
        color: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)]',
        dot: 'bg-[var(--color-warning)]',
      }
    : {
        label: JOB_DISPLAY_LABEL.repeat,
        color: 'text-[var(--color-info)] bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-info)_30%,transparent)]',
        dot: 'bg-[var(--color-info)]',
      }
}

export const JOB_PRIORITY_CONFIG: Record<JobPriority, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'text-[var(--color-text-muted)]' },
  normal: { label: 'Normal', color: 'text-[var(--color-text-secondary)]' },
  high:   { label: 'High',   color: 'text-[var(--color-warning)]' },
  urgent: { label: 'Urgent', color: 'text-[var(--color-danger)]' },
}

export interface Job {
  id: string; company_id: string; job_number: string
  sales_order_id: string | null; customer_id: string
  job_title: string; description: string | null
  size_l: number | null; size_w: number | null; size_h: number | null
  sheet_width_in: number | null; sheet_height_in: number | null
  quantity: number; no_of_colors: number | null
  box_type_id: string | null
  die_number: string | null; grain_direction: GrainDirection | null; board_type_id: string | null
  gsm: number | null
  ups: number | null; sheet_qty: number | null
  paper_type_id: string | null; lamination_type_id: string | null
  uv_coating: string | null; foil_type_id: string | null
  special_finishing: string | null; pasting: string | null
  workflow_template_id: string | null; current_stage_id: string | null
  status: JobStatus; priority: JobPriority
  order_date: string; required_date: string | null; completed_date: string | null
  is_on_hold: boolean; hold_reason_id: string | null
  hold_notes: string | null; hold_started_at: string | null
  parent_job_id: string | null; is_repeat: boolean; repeat_sequence: number
  quoted_amount: number | null; internal_remarks: string | null
  assigned_to: string | null; artwork_by: string | null
  created_at: string; updated_at: string; is_active: boolean
  customers?: { name: string; customer_code: string } | null
  workflow_templates?: { name: string } | null
}

export interface JobStageProgress {
  id: string; job_id: string; workflow_stage_id: string
  sequence_order: number; status: StageStatus
  started_at: string | null; completed_at: string | null; notes: string | null
  workflow_stages?: { name: string; is_optional: boolean; estimated_hours: number | null }
}

export interface JobEvent {
  id: string; job_id: string; event_type: EventType
  old_value: string | null; new_value: string | null
  notes: string | null; actor_id: string | null; occurred_at: string
  users?: { full_name: string } | null
}

export interface WastageReason { id: string; name: string; category: string }

export interface JobWastage {
  id: string; job_id: string; stage_progress_id: string | null
  machine_id: string | null; wastage_reason_id: string
  quantity: number; notes: string | null
  recorded_by: string | null; occurred_at: string
  wastage_reasons?: { name: string; category: string } | null
  machines?: { name: string } | null
  users?: { full_name: string } | null
}

export interface JobFormData {
  customer_id: string; job_title: string; description: string
  sales_order_id: string; sales_order_item_id: string
  size_l: string; size_w: string; size_h: string
  sheet_width_in: string; sheet_height_in: string; box_type_id: string
  quantity: string; no_of_colors: string; die_number: string; gsm: string
  ups: string
  board_type_id: string; paper_type_id: string
  lamination_type_id: string; uv_coating: string
  foil_type_id: string; special_finishing: string; pasting: string
  workflow_template_id: string; priority: JobPriority
  required_date: string; quoted_amount: string; internal_remarks: string
}

export const EMPTY_JOB_FORM: JobFormData = {
  customer_id: '', job_title: '', description: '', sales_order_id: '', sales_order_item_id: '',
  size_l: '', size_w: '', size_h: '', sheet_width_in: '', sheet_height_in: '', box_type_id: '', quantity: '1000',
  no_of_colors: '4', die_number: '', gsm: '', ups: '', board_type_id: '', paper_type_id: '',
  lamination_type_id: '', uv_coating: '', foil_type_id: '',
  special_finishing: '', pasting: '', workflow_template_id: '',
  priority: 'normal', required_date: '', quoted_amount: '', internal_remarks: '',
}
