/*
  # Update role constraint and create Nikhil staff user

  1. Expands user_profiles role check to allow 'staff' and 'accountant'
  2. Creates Nikhil as a staff user (username: nikhil, password: nik@123)
*/

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'user'::text, 'staff'::text, 'accountant'::text]));

DO $$
DECLARE
  new_user_id uuid;
BEGIN
  SELECT id INTO new_user_id FROM auth.users WHERE email = 'nikhil@prachifulagar.app';

  IF new_user_id IS NULL THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'nikhil@prachifulagar.app',
      crypt('nik@123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"display_name":"Nikhil","role":"staff"}',
      now(), now(),
      'authenticated', 'authenticated'
    );
  END IF;

  INSERT INTO public.user_profiles (id, email, display_name, role)
  VALUES (new_user_id, 'nikhil@prachifulagar.app', 'Nikhil', 'staff')
  ON CONFLICT (id) DO UPDATE SET display_name = 'Nikhil', role = 'staff';
END $$;
