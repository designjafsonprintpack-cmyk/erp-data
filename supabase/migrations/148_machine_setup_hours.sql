-- 148_machine_setup_hours.sql
--
-- WHAT WAS WRONG
-- Production Planning's "Hours" box next to each machine assignment was a blank
-- number input the planner had to guess at, every single time. The shop already
-- knows the answer: machines.capacity_per_hour is filled on all 9 live machines
-- (8,000 sheets/hr on the presses, 3,500 on die cutting, and so on) and the job
-- already carries its sheet_qty and quantity. The only missing piece was
-- make-ready — the press does not start running the moment the job reaches it.
--
-- WHAT THIS DOES
-- Adds machines.setup_hours: the make-ready / setup allowance for one job on
-- that machine, added on top of the run time. Planning now auto-fills
--     hours = setup_hours + qty / capacity_per_hour     (rounded to 15 minutes)
-- and the planner can still type over it — it is a default, never a lock.
--
-- The seeded values below are ordinary shop make-ready times per machine TYPE
-- and are meant to be corrected in Settings → Machines once real ones are known.
-- Nothing reads this column except the auto-fill, so a wrong value costs a
-- retype, never a save.
--
-- TO UNDO
--   ALTER TABLE machines DROP COLUMN setup_hours;

ALTER TABLE machines ADD COLUMN IF NOT EXISTS setup_hours NUMERIC(4,2);

COMMENT ON COLUMN machines.setup_hours IS
  'Make-ready / setup allowance in hours for one job on this machine. Added to '
  'run time (qty / capacity_per_hour) when Production Planning auto-fills a '
  'machine assignment''s estimated hours. NULL = no setup allowance.';

-- Seed per machine type. Only fills rows that have none, so re-running this
-- migration can never overwrite a value someone has corrected by hand.
UPDATE machines SET setup_hours = CASE machine_type
    WHEN 'printing'     THEN 1.50   -- plate mounting, register, colour matching
    WHEN 'diecutting'   THEN 1.00   -- die setup + stripping
    WHEN 'foldergluing' THEN 1.00   -- gluer setup
    WHEN 'hotfoil'      THEN 1.00   -- foil block + temperature
    WHEN 'lamination'   THEN 0.50
    ELSE 0.50
  END
WHERE setup_hours IS NULL;

NOTIFY pgrst, 'reload schema';
