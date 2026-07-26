-- 093 — coating_types renamed to the names the shop actually uses
--
-- What broke: the Job form's UV Coating dropdown had four options hardcoded in
-- NewJobClient.tsx / EditJobClient.tsx — 'UV', 'Soft UV', 'Water Base',
-- 'Drip-off' — while a real coating_types master table had existed since
-- migration 060 with six different names, managed by nobody and reachable from
-- no settings page. Adding or removing a coating was therefore impossible
-- without a code change.
--
-- Two problems came out of that split:
--
--   1. 'Soft UV' is not a coating. The shop's shorthand S/UV means SPOT UV —
--      varnish applied to selected areas only. Migration 060 already had this
--      right ('Spot UV'); the job dropdown, added later, guessed wrong. Mehboob
--      caught it while cleaning the legacy job sheet. Nothing is renamed on the
--      jobs side because jobs.uv_coating holds free text and the table is
--      currently empty — but the dropdown option is corrected in the same
--      commit as this migration.
--
--   2. The two name sets did not overlap, so simply pointing the dropdown at
--      coating_types would have made every legacy value unselectable: the
--      select would render blank and the next save would silently clear it.
--
-- This migration renames three rows so the master table matches both the
-- dropdown that has been in use and the legacy sheet being imported:
--
--     'UV Coating'       -> 'UV'
--     'Gloss Water Base' -> 'Water Base'
--     'Drip Off'         -> 'Drip-off'
--
-- 'Spot UV' was already correct. 'Matt Water Base' and 'Blaster Coating' are
-- left alone — both are real coatings, and they can now be removed from
-- Settings > Materials > Coating Types if the shop does not run them.
--
-- Safe: ids are preserved, so quotation_items.coating_type_id keeps pointing at
-- the same rows (that table is empty today in any case). Company-scoped, so a
-- second tenant with its own names is untouched. Only renames rows whose old
-- name is still present, so re-running it does nothing.
--
-- To undo: swap the name pairs below and run again.

UPDATE coating_types SET name = 'UV'
 WHERE name = 'UV Coating' AND deleted_at IS NULL;

UPDATE coating_types SET name = 'Water Base'
 WHERE name = 'Gloss Water Base' AND deleted_at IS NULL;

UPDATE coating_types SET name = 'Drip-off'
 WHERE name = 'Drip Off' AND deleted_at IS NULL;

-- Any tenant created before 060's seed, or one whose rows were deleted, gets
-- the four names the job form depends on. Existing rows are never duplicated.
INSERT INTO coating_types (company_id, name)
SELECT c.id, v.n
FROM companies c
CROSS JOIN (VALUES ('UV'), ('Spot UV'), ('Water Base'), ('Drip-off')) AS v(n)
WHERE NOT EXISTS (
  SELECT 1 FROM coating_types ct
  WHERE ct.company_id = c.id AND lower(ct.name) = lower(v.n) AND ct.deleted_at IS NULL
);

COMMENT ON TABLE coating_types IS
  'Coating options for jobs and quotation costing. Managed in Settings > Materials > Coating Types; the Job form UV Coating dropdown reads from here.';

NOTIFY pgrst, 'reload schema';
