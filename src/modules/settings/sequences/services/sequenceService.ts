import { createSupabaseServerClient } from '@/lib/supabase/server'
import { AppError } from '@/types/shared'

export type DocumentType = 'JOB' | 'SO' | 'QT' | 'PO' | 'DISP'

export async function generateDocumentNumber(companyId: string, documentType: DocumentType): Promise<string> {
  const supabase = createSupabaseServerClient()
  // Use raw query via rpc cast to bypass strict type checking on ungenerated DB types
  const { data, error } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId,
    p_document_type: documentType,
  })
  if (error) throw new AppError('SEQUENCE_FAILED', `Failed to generate ${documentType} number: ${error.message}`)
  if (!data) throw new AppError('SEQUENCE_EMPTY', 'Sequence returned empty result')
  return data as string
}

export async function getSequenceStatus(): Promise<Array<{ document_type: string; year: number; prefix: string; current_value: number; padding: number }>> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('document_sequences' as any)
    .select('document_type, year, prefix, current_value, padding')
    .eq('year', new Date().getFullYear())
    .order('document_type')
  if (error) throw new AppError('SEQUENCE_STATUS_FAILED', error.message)
  return (data ?? []) as any[]
}

export async function updateSequenceConfig(companyId: string, documentType: string, prefix: string, padding: number): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from('document_sequences' as any)
    .update({ prefix, padding })
    .eq('company_id', companyId)
    .eq('document_type', documentType)
    .eq('year', new Date().getFullYear())
  if (error) throw new AppError('SEQUENCE_UPDATE_FAILED', error.message)
}
