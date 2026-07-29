import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventType } from '../types/job.types'
import { syncJobCurrentStage } from '@/lib/utils/syncJobCurrentStage'

interface RecordEventPayload {
  company_id: string
  job_id: string
  event_type: EventType
  old_value?: string | null
  new_value?: string | null
  notes?: string | null
  stage_id?: string | null
  actor_id?: string | null
}

/**
 * Central append-only event recorder.
 * ALWAYS call this whenever job state changes.
 * Signature: recordJobEvent(payload, supabase)
 */
export async function recordJobEvent(
  payload: RecordEventPayload,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase.from('job_stage_events' as any).insert({
    company_id: payload.company_id,
    job_id: payload.job_id,
    event_type: payload.event_type,
    old_value: payload.old_value ?? null,
    new_value: payload.new_value ?? null,
    notes: payload.notes ?? null,
    stage_id: payload.stage_id ?? null,
    actor_id: payload.actor_id ?? null,
  })

  // Still swallowed on purpose — losing an audit line must never fail the
  // action that caused it. But it is no longer INVISIBLE: migration 104 added
  // 'proof_created' / 'proof_decided' without widening this table's event_type
  // CHECK, and because nothing here read the error, every press-proof event was
  // dropped while the route happily returned 200. Fixed by 108; this line is so
  // the next missing event type shows up in the logs instead of years later.
  if (error) {
    console.error(
      `[recordJobEvent] failed to record "${payload.event_type}" for job ${payload.job_id}: ${error.message}`
    )
  }
}

/**
 * Initialize workflow stages for a job when workflow is assigned.
 */
export async function initializeJobWorkflow(
  jobId: string,
  workflowTemplateId: string,
  companyId: string,
  supabase: SupabaseClient
): Promise<void> {
  // Fetch all stages for this template
  const { data: stages } = await supabase
    .from('workflow_stages' as any)
    .select('id, sequence_order, name')
    .eq('workflow_template_id', workflowTemplateId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('sequence_order')

  if (!stages?.length) return

  // Create workflow instance record
  await supabase.from('job_workflow_instances' as any).upsert({
    company_id: companyId,
    job_id: jobId,
    workflow_template_id: workflowTemplateId,
  }, { onConflict: 'company_id,job_id' })

  // Create stage progress rows
  const progressRows = (stages as any[]).map(stage => ({
    company_id: companyId,
    job_id: jobId,
    workflow_stage_id: stage.id,
    sequence_order: stage.sequence_order,
    status: 'pending',
  }))

  await supabase.from('job_stage_progress' as any)
    .upsert(progressRows, { onConflict: 'company_id,job_id,workflow_stage_id' })

  // A brand-new job is already standing on its first stage — stamp it now so
  // "kis stage par hai" is answerable from the moment the job exists, not
  // only after someone presses Start. Covers every caller of this function
  // (New Job, Repeat, and both QC reprint paths).
  await syncJobCurrentStage(supabase, companyId, jobId).catch(() => null)
}
