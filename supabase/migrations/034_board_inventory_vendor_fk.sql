-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 034: MISSING FK ON board_inventory.vendor_id
-- board_inventory.vendor_id was a plain UUID with no REFERENCES clause, unlike
-- purchase_orders.vendor_id which correctly references vendors(id) — meaning
-- board_inventory could silently point at a vendor that doesn't exist.
-- ══════════════════════════════════════════════════════════════════════════════

-- Defensive: null out any orphaned references before adding the constraint,
-- so this migration can never fail on existing data.
UPDATE board_inventory
SET vendor_id = NULL
WHERE vendor_id IS NOT NULL
  AND vendor_id NOT IN (SELECT id FROM vendors);

-- Guarded so this is safe to run whether or not 015_pre_production.sql
-- already added the constraint (it now does, for fresh installs going
-- forward — this migration exists to patch databases where 015 already ran
-- without it).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'board_inventory_vendor_id_fkey'
  ) THEN
    ALTER TABLE board_inventory
      ADD CONSTRAINT board_inventory_vendor_id_fkey
      FOREIGN KEY (vendor_id) REFERENCES vendors(id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
