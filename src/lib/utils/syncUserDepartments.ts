import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * EK AADMI KE DEPARTMENT — poori fehrist likhne ka aik hi tareeqa (146).
 *
 * Mehboob: *"aik shaks 2 ya 3 depart ko dakh raha hay is liyay wo apny account
 * say hi kam kery gy."* Is liye department ek nahi, fehrist hai.
 *
 * `users.department_id` ASAL department rehta hai — Department Queue wahin
 * khulti hai aur purani screens wohi dikhati hain — aur wo hamesha is fehrist
 * mein bhi shamil kiya jata hai, taake "is department mein kaun hai" ka jawab
 * dono jagah se aik jaisa aaye. Ye wohi bimari rokta hai jo 137 ne backfill par
 * dekhi thi: do fehristein, aur waqt ke saath alag.
 *
 * Purani rows HARD delete hoti hain, soft nahi: ye rukniyat hai, tareekh nahi.
 * Kisi aadmi ko department se hatane ka matlab hai ke us ka kaam ab usay nahi
 * milna chahiye — soft-delete chhoRne se `deleted_at IS NULL` wale har query
 * mein wo mojood rehta.
 */
export async function syncUserDepartments(
  supabase: SupabaseClient,
  companyId: string,
  userId: string,
  departmentIds: string[],
  primaryDepartmentId?: string | null,
): Promise<{ error?: string }> {
  const wanted = Array.from(new Set(
    [...(departmentIds ?? []), ...(primaryDepartmentId ? [primaryDepartmentId] : [])].filter(Boolean)
  ))

  const { data: current, error: readErr } = await supabase.from('user_departments' as any)
    .select('id, department_id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
  if (readErr) return { error: readErr.message }

  const have = new Map<string, string>()
  for (const r of ((current ?? []) as any[])) have.set(r.department_id, r.id)

  const toAdd = wanted.filter(d => !have.has(d))
  const toRemove = Array.from(have.entries()).filter(([d]) => !wanted.includes(d)).map(([, id]) => id)

  if (toRemove.length) {
    const { error } = await supabase.from('user_departments' as any).delete().in('id', toRemove)
    if (error) return { error: error.message }
  }
  if (toAdd.length) {
    const { error } = await supabase.from('user_departments' as any).insert(
      toAdd.map(d => ({ company_id: companyId, user_id: userId, department_id: d }))
    )
    if (error) return { error: error.message }
  }
  return {}
}

export default syncUserDepartments
