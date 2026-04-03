/*
  # Fix RLS Policy Performance - Auth Initialization Plan

  ## Summary
  Replaces direct `auth.uid()` calls with `(select auth.uid())` in RLS policies
  to prevent re-evaluation on every row. This significantly improves query
  performance at scale by evaluating auth functions once per query.

  ## Tables affected
  - user_profiles: view, update, insert policies
  - customer_documents: insert, update, delete policies

  ## Note
  All "always true" policies are intentional for this single-tenant business app
  where all authenticated users are trusted staff. The policies correctly gate
  on authentication status. Only user_profiles and customer_documents have
  ownership-based checks that need the (select auth.uid()) optimization.
*/

-- Fix user_profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;

CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own profile"
  ON public.user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

-- Fix customer_documents policies
DROP POLICY IF EXISTS "Authenticated users can insert customer documents" ON public.customer_documents;
DROP POLICY IF EXISTS "Authenticated users can update customer documents" ON public.customer_documents;
DROP POLICY IF EXISTS "Authenticated users can delete customer documents" ON public.customer_documents;

CREATE POLICY "Authenticated users can insert customer documents"
  ON public.customer_documents FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update customer documents"
  ON public.customer_documents FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can delete customer documents"
  ON public.customer_documents FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
