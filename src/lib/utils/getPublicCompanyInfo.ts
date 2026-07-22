import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export interface PublicCompanyInfo {
  name: string
  address: string | null
  ntn: string | null
  logo_url: string | null
}

const DEFAULTS: PublicCompanyInfo = {
  name: 'Jafson Print ERP',
  address: null,
  ntn: null,
  logo_url: null,
}

/**
 * Best-effort company lookup for pages that render before a user session
 * exists (login screen, root <title>) — there's no JWT/company_id yet to
 * resolve tenancy from, so this uses the service-role client directly.
 * Single-tenant deployment assumption: picks the first active company row.
 * Never throws — falls back to the original hardcoded "Jafson Print ERP"
 * branding on any error, so a Supabase hiccup can never break the login page.
 */
export async function getPublicCompanyInfo(): Promise<PublicCompanyInfo> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('companies' as any)
      .select('name, address, ntn, logo_url')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!data) return DEFAULTS
    return {
      name: (data as any).name || DEFAULTS.name,
      address: (data as any).address ?? null,
      ntn: (data as any).ntn ?? null,
      logo_url: (data as any).logo_url ?? null,
    }
  } catch {
    return DEFAULTS
  }
}
