export type JobStatus = 'new' | 'in_progress' | 'on_hold' | 'completed' | 'dispatched' | 'cancelled'
export type JobPriority = 'low' | 'normal' | 'high' | 'urgent'
export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'
export type EventType =
  | 'created' | 'status_changed' | 'stage_started' | 'stage_completed'
  | 'stage_skipped' | 'hold_started' | 'hold_ended' | 'remark_added'
  | 'artwork_uploaded' | 'repeat_created' | 'assigned' | 'priority_changed'

export const JOB_STATUS_CONFIG: Record<JobStatus, { label: string; color: string; dot: string }> = {
  new:         { label: 'New',         color: 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/30',      dot: 'bg-[var(--color-accent)]' },
  in_progress: { label: 'In Progress', color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/30',   dot: 'bg-[var(--color-warning)]' },
  on_hold:     { label: 'On Hold',     color: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/30',      dot: 'bg-[var(--color-danger)]' },
  completed:   { label: 'Completed',   color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/30',   dot: 'bg-[var(--color-success)]' },
  dispatched:  { label: 'Dispatched',  color: 'text-[var(--color-info)] bg-[var(--color-info)]/10 border-[var(--color-info)]/30',            dot: 'bg-[var(--color-info)]' },
  cancelled:   { label: 'Cancelled',   color: 'text-[var(--color-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]',        dot: 'bg-[var(--color-muted)]' },
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
  sheet_size: string | null; quantity: number; no_of_colors: number | null
  die_number: string | null; board_type_id: string | null
  paper_type_id: string | null; lamination_type_id: string | null
  uv_coating: boolean; foil_type_id: string | null
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

export interface JobFormData {
  customer_id: string; job_title: string; description: string
  sales_order_id: string
  size_l: string; size_w: string; size_h: string; sheet_size: string
  quantity: string; no_of_colors: string; die_number: string
  board_type_id: string; paper_type_id: string
  lamination_type_id: string; uv_coating: boolean
  foil_type_id: string; special_finishing: string; pasting: string
  workflow_template_id: string; priority: JobPriority
  required_date: string; quoted_amount: string; internal_remarks: string
}

export const EMPTY_JOB_FORM: JobFormData = {
  customer_id: '', job_title: '', description: '', sales_order_id: '',
  size_l: '', size_w: '', size_h: '', sheet_size: '', quantity: '1000',
  no_of_colors: '4', die_number: '', board_type_id: '', paper_type_id: '',
  lamination_type_id: '', uv_coating: false, foil_type_id: '',
  special_finishing: '', pasting: '', workflow_template_id: '',
  priority: 'normal', required_date: '', quoted_amount: '', internal_remarks: '',
}
