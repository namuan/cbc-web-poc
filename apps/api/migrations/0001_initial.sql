CREATE TYPE member_role AS ENUM ('member', 'manager');
CREATE TYPE equipment_status AS ENUM ('available', 'checked_out', 'maintenance', 'retired');
CREATE TYPE loan_condition AS ENUM ('serviceable', 'maintenance');

CREATE TABLE members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  email text NOT NULL UNIQUE CHECK (length(email) <= 320),
  role member_role NOT NULL DEFAULT 'member',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  status equipment_status NOT NULL DEFAULT 'available',
  created_by uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  checked_out_by uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  checked_out_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  returned_at timestamptz,
  returned_by uuid REFERENCES members(id) ON DELETE RESTRICT,
  return_condition loan_condition,
  condition_note text,
  CHECK (due_at > checked_out_at),
  CHECK (
    (returned_at IS NULL AND returned_by IS NULL AND return_condition IS NULL AND condition_note IS NULL)
    OR
    (returned_at IS NOT NULL AND returned_by IS NOT NULL AND return_condition IS NOT NULL)
  ),
  CHECK (condition_note IS NULL OR length(condition_note) <= 2000)
);

CREATE UNIQUE INDEX loans_one_active_per_equipment
  ON loans(equipment_id)
  WHERE returned_at IS NULL;

CREATE INDEX loans_member_checked_out_idx
  ON loans(member_id, checked_out_at DESC);

CREATE INDEX loans_active_due_idx
  ON loans(due_at)
  WHERE returned_at IS NULL;

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('equipment.created', 'loan.checked_out', 'loan.returned', 'equipment.maintenance', 'equipment.restored', 'equipment.retired')),
  entity_type text NOT NULL CHECK (entity_type IN ('equipment', 'loan')),
  entity_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_entity_idx
  ON audit_events(entity_type, entity_id, occurred_at DESC);

CREATE FUNCTION reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only';
END;
$$;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
