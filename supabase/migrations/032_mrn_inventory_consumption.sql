-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 032: MRN → BOARD INVENTORY AUTO-CONSUMPTION
--
-- material_requisition_items only ever had a free-text material_name — there
-- was no link to a specific board_inventory row, so issuing an MRN never
-- touched board_inventory.current_stock or created a board_inventory_movements
-- record. "Inventory Consumption" was effectively unimplemented despite the
-- movements table already existing for exactly this purpose.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE material_requisition_items
  ADD COLUMN board_item_id UUID REFERENCES board_inventory(id);

CREATE INDEX idx_mrn_items_board_item ON material_requisition_items(board_item_id);

NOTIFY pgrst, 'reload schema';
