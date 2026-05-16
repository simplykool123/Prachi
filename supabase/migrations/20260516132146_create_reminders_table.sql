/*
  # Create Reminders Table

  ## Purpose
  The Sidebar component polls a `reminders` table to show upcoming purchase delivery reminders.
  This table did not exist, causing hundreds of 404 errors in the console on every session.

  ## New Tables
  - `reminders`
    - `id` (uuid, primary key)
    - `user_id` (uuid, references auth.users) — owner of the reminder
    - `title` (text) — reminder title
    - `body` (text) — reminder details
    - `remind_at` (timestamptz) — when to show the reminder
    - `reference_type` (text) — e.g., 'purchase_entry', 'sales_order'
    - `reference_id` (uuid) — foreign key to the referenced record
    - `is_read` (boolean, default false)
    - `created_at` (timestamptz, default now())

  ## Security
  - RLS enabled
  - Users can only read/update their own reminders
  - Service role can insert reminders (for automation)
*/

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  remind_at timestamptz NOT NULL,
  reference_type text,
  reference_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own reminders"
  ON reminders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own reminders"
  ON reminders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own reminders"
  ON reminders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reminders"
  ON reminders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS reminders_user_remind_at_idx ON reminders (user_id, remind_at);
CREATE INDEX IF NOT EXISTS reminders_reference_idx ON reminders (reference_type, reference_id);
