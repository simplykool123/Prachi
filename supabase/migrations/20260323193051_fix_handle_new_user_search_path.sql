/*
  # Fix handle_new_user Function Search Path

  ## Summary
  Sets a fixed search_path on the handle_new_user trigger function to prevent
  search_path injection attacks. Without a fixed search_path, a malicious user
  could potentially manipulate which schemas are searched.

  ## Change
  Recreates the handle_new_user function with `SET search_path = public`
  to lock it to the public schema.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
