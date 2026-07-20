// Escapes a user-supplied search term before it's interpolated into a
// PostgREST filter string (e.g. `.or(\`name.ilike.%${term}%\`)`).
//
// PostgREST's filter syntax treats `,` (condition separator), `.`
// (column.operator.value separator), and `(` `)` (grouping/negation) as
// structural characters when a value is written bare/unquoted. A raw search
// term containing any of these can therefore inject extra filter clauses
// instead of being treated as literal search text.
//
// PostgREST's own documented fix is to wrap the value in double quotes,
// which makes everything inside literal — the value just needs its own
// backslashes and double quotes escaped first. This does NOT restrict what
// customers/vendors/etc. can search for (names with commas, parentheses,
// periods all still work correctly) — it only stops the value from being
// parsed as filter syntax.
export function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
