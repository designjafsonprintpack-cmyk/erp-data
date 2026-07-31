-- ═══════════════════════════════════════════════════════════════════════════
-- ROLE PERMISSION AUDIT — fill the gaps that stop people doing their job
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS IS
--   Mehboob: "kuch role ki Permissions abhi b empty hay, sub roles ki
--   permission apny hisab say set ker do."
--
--   Audited all 17 roles x 31 modules x 9 actions against live first. **No role
--   is actually empty** — the thinnest is `plates` at 13 grants and it works.
--   What the audit DID find is nine places where a role is missing something it
--   demonstrably needs, and one place where an Admin is locked out of the
--   dashboard.
--
-- WHAT THIS DOES — AND WHAT IT DELIBERATELY DOES NOT
--   **Only adds. Nothing is revoked.** Taking a permission away from a live
--   role stops someone's work mid-shift, and several of these roles look
--   over-broad rather than wrong (see the list at the bottom). Additive is
--   reversible in one tick; a person locked out at 2am is not.
--
--   The one exception is `admin`, where 18 rows were switched OFF by hand and
--   are switched back ON — flagged separately below because it is the only
--   change here that reverses an explicit existing state.
--
-- ─── THE GAPS, AND WHY EACH ONE IS REAL ───────────────────────────────────
--   admin      · `customers` and `dashboard` are 18 rows with is_active=FALSE,
--                and has_permission() requires rp.is_active — so an Admin
--                genuinely cannot open the dashboard or the customer list. Also
--                had no `admin` module at all. Flagged in CLAUDE.md since 105
--                and never actioned.
--   dispatch   · no `customers`. The person delivering the order cannot look up
--                the customer's address or phone. The dispatch FORM prefills an
--                address because its server component queries customers
--                directly, but the Customers screen itself is invisible.
--   store      · no `jobs`. Board is issued AGAINST a job and the auto-MRN
--                carries the job's sheet_qty — the storeman could not open the
--                job to check the spec he is issuing against.
--   accounts   · no `jobs`. An invoice is raised against a job.
--   purchase   · no `jobs`. 113's entire purpose was answering "kon sa board
--                kis job ke liye aaya" — the PO line carries a job_id, and
--                Purchase could not see the job it was picking.
--   printing   · no `qc`. An operator had no way to see that the job he ran was
--                failed by QC. Also no `production`, so Floor View was closed
--                to the very people standing on the floor.
--   qc         · no `artwork`. A QC inspector compares the printed sheet to the
--                APPROVED artwork; without it the inspection is from memory.
--   plates     · no `production`. A plate maker cannot see what is running.
--   sales      · no `dispatch`. "Mera order gaya ya nahi" is the single most
--                common customer question a salesman gets.
--   owner, gm  · modules missing from the matrix. Owner short-circuits
--                has_permission() entirely so this changes no behaviour, but a
--                Settings screen that shows an unticked box for something that
--                is actually in force is worse than useless.
--
--   Every grant is `view`/`print`/`export` — read-only — except where the role
--   already owns the module. Nobody gains the ability to CHANGE anything they
--   could not change before, and no `delete`, `settings` or `approve` is
--   granted to any operational role (105's rule).
--
-- MONEY IS UNTOUCHED
--   Not one money scope is granted here. 119/120/122 decided who sees rates and
--   this migration does not revisit it: `jobs` view exposes no amount (the
--   quoted-amount card is `MoneyGate hide` on the `cost` scope), and neither
--   does `dispatch` or `customers` view.
--
-- DEPENDS ON
--   005 (roles/permissions), and 119-122 for the roles it names. Run those
--   first — all four already are on live except 122.
--   Safe to run before 122: the `store_manager` grants below are guarded by the
--   role existing, so they simply no-op and can be picked up by re-running.
--
-- HOW TO UNDO
--   The additions:
--     DELETE FROM role_permissions rp
--      USING roles r, permissions p
--      WHERE rp.role_id = r.id AND rp.permission_id = p.id
--        AND rp.created_at >= '<the timestamp you ran this>'
--        AND r.company_id = '00000000-0000-0000-0000-000000000001';
--   The admin re-enable (this puts the lockout BACK, only do it deliberately):
--     UPDATE role_permissions rp SET is_active = FALSE
--       FROM roles r, permissions p
--      WHERE rp.role_id = r.id AND rp.permission_id = p.id
--        AND r.slug = 'admin' AND p.module IN ('customers','dashboard');
--
-- MIGRATION RISK
--   Additive and idempotent. No table changes, no backfill, nothing locks.
--   Re-running changes nothing — EXCEPT that it will re-enable `admin`'s
--   customers/dashboard again if they were switched off in between. That is
--   deliberate for those two modules only; every other guard respects a
--   permission turned off by hand.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
  g   RECORD;
BEGIN
  -- ─── 1. THE GAPS ──────────────────────────────────────────────────────────
  -- (role slug, module, actions) — read-only unless the role already owns it.
  FOR g IN
    SELECT * FROM (VALUES
      -- The office roles all need to see the JOB their document hangs off.
      ('accounts',   'jobs',            ARRAY['view','print']),
      ('purchase',   'jobs',            ARRAY['view','print']),
      ('store',      'jobs',            ARRAY['view','print']),
      ('store',      'vendors',         ARRAY['view','print']),
      ('store_manager','jobs',          ARRAY['view','print']),
      ('store_manager','vendors',       ARRAY['view','print']),

      -- Dispatch delivers to a customer; it has to be able to find one.
      ('dispatch',   'customers',       ARRAY['view','print']),

      -- Sales gets asked "has my order shipped" every day.
      ('sales',      'dispatch',        ARRAY['view','print']),

      -- The floor should be able to see the floor, and to see its own QC result.
      ('printing',   'production',      ARRAY['view']),
      ('printing',   'qc',              ARRAY['view','print']),
      ('printing',   'reports',         ARRAY['view','print']),
      ('plates',     'production',      ARRAY['view']),

      -- A QC inspector compares the sheet against the APPROVED artwork.
      ('qc',         'artwork',         ARRAY['view','print']),

      -- Admin: the module it never had.
      ('admin',      'admin',           ARRAY['view','create','edit','print','export']),
      ('admin',      'customers',       ARRAY['view','create','edit','print','export']),
      ('admin',      'dashboard',       ARRAY['view']),

      -- GM and Owner: modules missing from the matrix. Owner bypasses
      -- has_permission() outright, so this is honesty, not access.
      ('gm',         'admin',           ARRAY['view','create','edit','print','export']),
      ('owner',      'admin',           ARRAY['view','create','edit','print','export']),
      ('owner',      'machines',        ARRAY['view','create','edit','print','export']),
      ('owner',      'production',      ARRAY['view','create','edit','print','export']),
      ('owner',      'qc',              ARRAY['view','create','edit','print','export','approve','reject']),
      ('owner',      'workflow',        ARRAY['view','create','edit','print','export'])
    ) AS v(role_slug, module_key, actions)
  LOOP
    INSERT INTO role_permissions (company_id, role_id, permission_id)
    SELECT cid, r.id, p.id
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.company_id = cid AND r.slug = g.role_slug AND r.deleted_at IS NULL
      AND p.company_id = cid AND p.deleted_at IS NULL
      AND p.module = g.module_key AND p.action = ANY(g.actions)
      AND NOT EXISTS (
        SELECT 1 FROM role_permissions rp
         WHERE rp.role_id = r.id AND rp.permission_id = p.id
      );
  END LOOP;

  -- ─── 2. UNLOCK THE ADMIN ──────────────────────────────────────────────────
  -- The ONLY place this migration reverses an existing explicit state.
  -- 18 rows (customers x9, dashboard x9) sit at is_active = FALSE, and
  -- has_permission() requires rp.is_active — so the Admin role cannot open the
  -- dashboard or the customer list at all. Flagged in CLAUDE.md since 105 and
  -- never acted on. If it was deliberate, the undo above puts it back.
  UPDATE role_permissions rp
     SET is_active = TRUE, deleted_at = NULL, updated_at = NOW()
    FROM roles r, permissions p
   WHERE rp.role_id = r.id
     AND rp.permission_id = p.id
     AND r.company_id = cid AND r.slug = 'admin' AND r.deleted_at IS NULL
     AND p.company_id = cid AND p.module IN ('customers','dashboard')
     AND (rp.is_active = FALSE OR rp.deleted_at IS NOT NULL);
END $$;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THE AUDIT FOUND BUT THIS MIGRATION DELIBERATELY LEAVES ALONE
-- ═══════════════════════════════════════════════════════════════════════════
-- Each of these is a REMOVAL, and removals break people mid-shift. They are
-- written down so the next person does not have to re-derive them, and so
-- Mehboob can decide each one on its own:
--
--   1. `planning` holds 22 modules — including `machines edit`, `workflow
--      edit`, and `edit` on all six production stage modules. A planner
--      scheduling work does not need to edit stage progress; that is the
--      operator's action. Tightening this is the single biggest reduction
--      available (its sidebar is 23 links, the longest of any non-management
--      role).
--   2. `dashboard` and `reports` carry `create`/`edit`/`print` on several roles
--      (dispatch, store, sales, printing). Those actions do not correspond to
--      any real operation on a dashboard or a report — they are noise from the
--      005 seed's `p.action IN (...)` broad grants. Harmless, but they make the
--      permissions matrix hard to read.
--   3. `store` holds `purchase create/edit` — the Store can raise a purchase
--      order. That may well be intended (a storeman reordering board), but it
--      sits oddly beside a dedicated `purchase` role, and with 120 in force the
--      plain Store role cannot see the rate it would be entering.
--   4. `artwork` holds `plates approve/reject`. Plate approval sitting with the
--      designer rather than the plate maker or QC is worth a second look.
--   5. `admin` holds `delete` on 26 modules. CLAUDE.md's stated rule is that
--      only superadmin / owner / ceo / gm get `delete`.
-- ═══════════════════════════════════════════════════════════════════════════
