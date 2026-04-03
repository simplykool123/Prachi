/*
  # Create Default Admin User (v2)

  Creates the default admin account for the app with username-based login.
  Username: admin  →  email: admin@prachifulagar.app
  Password: admin123
*/

DO $$
DECLARE
  new_user_id uuid := '1884986f-a14f-43bd-b3ba-b8cb4b71dfad';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@prachifulagar.app') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'admin@prachifulagar.app',
      crypt('admin123', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      '{"display_name":"Admin","role":"admin"}',
      false, '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
    ) VALUES (
      gen_random_uuid(),
      new_user_id,
      json_build_object('sub', new_user_id::text, 'email', 'admin@prachifulagar.app'),
      'email',
      now(), now(), now(),
      'admin@prachifulagar.app'
    );
  END IF;

  INSERT INTO user_profiles (id, email, display_name, role, created_at, updated_at)
  VALUES (new_user_id, 'admin@prachifulagar.app', 'Admin', 'admin', now(), now())
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    updated_at = now();
END $$;
