import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventType } from '../types/job.types'

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
  await supabase.from('job_stage_events' as any).insert({
    company_id: payload.company_id,
    job_id: payload.job_id,
    event_type: payload.event_type,
    old_value: payload.old_value ?? null,
    new_value: payload.new_value ?? null,
    notes: payload.notes ?? null,
    stage_id: payload.stage_id ?? null,
    actor_id: payload.actor_id ?? null,
  })
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
}
