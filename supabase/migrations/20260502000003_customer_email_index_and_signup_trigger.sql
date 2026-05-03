/*
  # Customer Email Uniqueness + Auto-Create on Signup

  When a new customer signs up on the website (auth.users insert), we want a
  matching public.customers row to appear automatically so the website's
  My Account page works immediately.

  - Adds a unique index on lower(email) so ON CONFLICT (lower(email)) works
    and so two website signups can't end up with duplicate customer rows.
  - Creates a SECURITY DEFINER trigger function on auth.users.

  The trigger only INSERTs; it never updates existing rows. ERP-created
  customers (which already exist before any website signup) are preserved.
*/

-- Step 1: Normalize empty-string emails to NULL so the partial unique index works
-- and so case-insensitive uniqueness is reliable. Empty string and NULL mean the
-- same thing for an email, but '' would collide with itself in lower(email).
UPDATE public.customers
SET    email = NULL
WHERE  email IS NOT NULL
  AND  trim(email) = '';

-- Step 2: Refuse to proceed if the data has case-insensitive email duplicates.
-- We do NOT silently null duplicates here — that would lose data the ERP team
-- may need for customer communications. Instead, raise a clear error so a human
-- can resolve them (merge customers, blank one side, etc.) BEFORE re-running.
DO $$
DECLARE
  dup_count int;
  sample text;
BEGIN
  SELECT count(*), string_agg(DISTINCT lower_email, ', ')
  INTO dup_count, sample
  FROM (
    SELECT lower(email) AS lower_email
    FROM   public.customers
    WHERE  email IS NOT NULL
    GROUP  BY lower(email)
    HAVING count(*) > 1
    LIMIT  5
  ) d;

  IF COALESCE(dup_count, 0) > 0 THEN
    RAISE EXCEPTION
      'Cannot create unique email index: % case-insensitive duplicate email(s) found in public.customers. Examples: %. Please merge or null the duplicates manually, then re-run this migration.',
      dup_count, sample;
  END IF;
END $$;

-- Step 3: Unique index on lower(email) — needed for ON CONFLICT and to prevent
-- two website signups from creating duplicate customers. Partial so NULL emails
-- (ERP-only contacts) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_lower_unique_idx
  ON public.customers (lower(email))
  WHERE email IS NOT NULL;

-- Trigger function — runs as SECURITY DEFINER so it can bypass RLS during signup.
-- Only creates a customers row when the signup explicitly declares it came from
-- the website (raw_user_meta_data ->> 'signup_source' = 'website'). ERP-internal
-- user creation (admin dashboard, admin-create-user edge fn) won't accidentally
-- spawn customer rows.
CREATE OR REPLACE FUNCTION public.create_customer_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Only run for website-originated signups
  IF COALESCE(NEW.raw_user_meta_data ->> 'signup_source', '') <> 'website' THEN
    RETURN NEW;
  END IF;

  -- Skip if the user has no email (edge case)
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.customers (name, email, phone, city, category, is_active)
  VALUES (
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'name', ''), split_part(NEW.email, '@', 1)),
    lower(NEW.email),   -- store email lowercased so the unique index never collides
    NULLIF(NEW.raw_user_meta_data ->> 'phone', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'city', ''),
    'B2C',
    true
  )
  ON CONFLICT (lower(email)) WHERE email IS NOT NULL AND email <> '' DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never break auth signup if customer insert fails for any reason.
  RAISE WARNING 'create_customer_for_new_user failed: %', SQLERRM;
  RETURN NEW;
END $$;

-- Drop and recreate trigger to keep this migration idempotent
DROP TRIGGER IF EXISTS on_auth_user_created_create_customer ON auth.users;

CREATE TRIGGER on_auth_user_created_create_customer
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_customer_for_new_user();
