import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Upload a file to a private Storage bucket under a company-scoped path, so
 * it matches the tenant-isolation RLS policies on storage.objects (see
 * migration 036_storage_buckets.sql — every path must start with the
 * uploader's own company_id).
 *
 * Returns the storage path (not a public URL — these buckets are private).
 * Use getSignedUrl() to generate a temporary viewable/downloadable link.
 */
export async function uploadFile(
  supabase: SupabaseClient,
  bucket: 'artwork' | 'qc-photos',
  companyId: string,
  subpath: string, // e.g. `${jobId}/${Date.now()}-${file.name}`
  file: File
): Promise<{ path: string | null; error: string | null }> {
  const path = `${companyId}/${subpath}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

/**
 * Generate a short-lived signed URL for a private storage object. Since
 * these buckets are not public, this is required to actually view/download a
 * previously uploaded file.
 */
export async function getSignedUrl(
  supabase: SupabaseClient,
  bucket: 'artwork' | 'qc-photos',
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds)
  if (error || !data) return null
  return data.signedUrl
}
