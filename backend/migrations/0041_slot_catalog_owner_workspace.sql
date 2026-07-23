-- Brand-scoped production slots: sector catalog remains global (owner NULL);
-- optional owner_workspace_id makes a definition visible/assignable only to that brand.

ALTER TABLE production_slot_definitions
    ADD COLUMN IF NOT EXISTS owner_workspace_id UUID NULL;

CREATE INDEX IF NOT EXISTS ix_production_slot_definitions_owner_workspace
    ON production_slot_definitions (owner_workspace_id)
    WHERE owner_workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_production_slot_definitions_sector_owner
    ON production_slot_definitions (sector_id, owner_workspace_id, status);

COMMENT ON COLUMN production_slot_definitions.owner_workspace_id IS
    'NULL = sector-global catalog slot. UUID = brand-private custom slot for that workspace only.';
