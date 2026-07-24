-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 084: BOARD ISSUE ↔ MRN AUTO-LINK (Feature 4, Batch 3)
-- ══════════════════════════════════════════════════════════════════════════════
-- Tags the "Board Issue" workflow stage the same way migrations 069/070/083
-- tagged Artwork/Customer Approval/Printing — lets the workflow route find
-- "the board issue stage" by type rather than matching the literal display
-- name, so renaming the stage doesn't silently disable this gate.
--
-- No new tables: material_requisitions/material_requisition_items already
-- exist and are already mature (migration 032's board_inventory
-- auto-consumption, real cost booking on issue). This migration only wires
-- the workflow stage to that existing module — see the accompanying route
-- change in jobs/[id]/workflow for the actual auto-create-MRN-on-start and
-- block-complete-until-issued behavior.
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE workflow_stages SET stage_type = 'board_issue'
WHERE name ILIKE 'board issue' AND stage_type IS NULL;

NOTIFY pgrst, 'reload schema';
