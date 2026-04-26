-- Reminders table for automation engine
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_rule_id UUID REFERENCES automation_rules(id) ON DELETE SET NULL,
  rule_name TEXT,
  trigger_event TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  entity_name TEXT,
  message TEXT NOT NULL,
  action_type TEXT,
  action_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminders_all_authenticated"
  ON reminders FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Add updated_at to automation_rules if missing
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add google_event_id to appointments for Google Calendar sync
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_event_id TEXT;
