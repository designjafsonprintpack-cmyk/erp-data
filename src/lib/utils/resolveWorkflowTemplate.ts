import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Works out which production workflow a job should get.
 *
 * Every route that creates a job goes through here, so New Job, Repeat and QC
 * Reprint can never disagree about the answer. Resolution order:
 *
 *   1. explicitId  — somebody picked a workflow on the form. A human's choice
 *                    always wins; nothing below is even consulted.
 *   2. box type    — box_types.workflow_template_id (migration 110). Box →
 *                    Standard Carton, HL → HL (Hinge Lid), Label/Sticker →
 *                    Label / Sticker. This is the case that matters most for
 *                    Repeat: all 478 legacy jobs carry workflow_template_id =
 *                    NULL by design, and copying that NULL was producing repeat
 *                    jobs with no stages that never appeared in any department
 *                    queue.
 *   3. is_default  — the pre-existing `job_auto_assign` behaviour, unchanged.
 *   4. null        — genuinely no workflow.
 *
 * Steps 2 and 3 are both gated on the `job_auto_assign` system setting. A shop
 * that switches auto-assign off wants to choose by hand, and quietly applying a
 * box-type mapping instead would defeat exactly the switch they just flipped.
 *
 * A mapped template that has since been soft-deleted or deactivated falls
 * through to the default rather than being handed back — otherwise
 * initializeJobWorkflow() finds no stages and silently no-ops, which is the
 * failure mode this whole function exists to remove.
 */
export async function resolveWorkflowTemplateId(
  supabase: SupabaseClient,
  companyId: string,
  opts: { explicitId?: string | null; boxTypeId?: string | null }
): Promise<string | null> {
  // 1 — an explicit choice wins outright
  if (opts.explicitId) return opts.explicitId

  // Auto-assign switch (Settings → System Settings)
  const { data: setting } = await supabase.from('system_settings' as any)
    .select('value').eq('company_id', companyId).eq('key', 'job_auto_assign').maybeSingle()
  if ((setting as any)?.value !== 'true') return null

  // 2 — the box type's own mapping
  if (opts.boxTypeId) {
    const { data: boxType } = await supabase.from('box_types' as any)
      .select('workflow_template_id').eq('company_id', companyId)
      .eq('id', opts.boxTypeId).is('deleted_at', null).maybeSingle()

    const mappedId = (boxType as any)?.workflow_template_id as string | null | undefined
    if (mappedId && await isUsableTemplate(supabase, companyId, mappedId)) return mappedId
  }

  // 3 — the default template
  const { data: defaultTemplate } = await supabase.from('workflow_templates' as any)
    .select('id').eq('company_id', companyId).eq('is_default', true)
    .is('deleted_at', null).eq('is_active', true).maybeSingle()

  return ((defaultTemplate as any)?.id as string | undefined) ?? null
}

async function isUsableTemplate(
  supabase: SupabaseClient,
  companyId: string,
  templateId: string
): Promise<boolean> {
  const { data } = await supabase.from('workflow_templates' as any)
    .select('id').eq('company_id', companyId).eq('id', templateId)
    .is('deleted_at', null).eq('is_active', true).maybeSingle()
  return Boolean(data)
}

export default resolveWorkflowTemplateId
