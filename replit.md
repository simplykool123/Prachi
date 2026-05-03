# Prachiful App - ERP/CRM System

## Overview
A comprehensive Enterprise Resource Planning (ERP) and Customer Relationship Management (CRM) system focused on Astrology and Vastu products. Manages inventory, sales, finance, and customer interactions.

## Tech Stack
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Backend/Database:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Icons:** Lucide React

## Project Structure
- `src/components/` - Reusable UI components (modals, toasts, sidebar, header)
- `src/contexts/` - React Contexts (AuthContext, DateRangeContext)
- `src/lib/` - Utilities and Supabase client initialization
- `src/pages/` - Page components organized by module (sales, finance, etc.)
- `src/services/` - Business logic for Supabase API interactions
- `src/types/` - TypeScript interfaces
- `supabase/migrations/` - Database schema SQL scripts
- `supabase/functions/` - Edge Functions (Deno/TypeScript)
- `public/` - Static assets

## Environment Variables Required
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

## Development
- Runs on port 5000 (`npm run dev`)
- Configured to allow all hosts for Replit proxy compatibility

## Key Modules
- **Inter-Godown Stock Transfer** (`src/pages/inventory/GodownTransfer.tsx`) — Transfer stock between godowns with full audit trail, stock movement logging, and document numbers (TRF-YYMM-####). Requires `godown_transfers` + `godown_transfer_items` tables (migration: `supabase/migrations/20260417000002_create_godown_transfers.sql`).
- **Enhanced Reports** (`src/pages/Reports.tsx`) — Six tabs: Sales Analysis, Profit & Loss, Stock Valuation, Buy vs Sell, Customer Aging, Outstanding Payables. All tabs have CSV export.
- **Invoice Edit Stock Rebalancing** — `handleEditSave` in `Invoices.tsx` now computes old-vs-new item quantity diffs and rebalances `godown_stock` + `products.stock_quantity` when an invoice is edited.

## Stock Architecture (Hybrid: Materialized Balance + Audit Ledger)
- **`godown_stock`** — current per-godown balance (materialized for O(1) reads).
- **`stock_movements`** — immutable audit ledger: every in/out logged with `reference_type` + `reference_id` (functions as the "stock_ledger" pattern).
- **`products.stock_quantity`** — cached total = SUM of `godown_stock` rows for the product.
- **Atomic posting via Postgres RPC `post_stock_movement`** (migration `20260417000004_post_stock_movement_rpc.sql`, TS wrapper `src/services/stockLedger.ts`): single transaction that (a) `FOR UPDATE` locks the godown_stock row to prevent races, (b) upserts the new clamped quantity, (c) inserts the stock_movements ledger row, (d) recomputes `products.stock_quantity` as SUM of all godown_stock rows. All-or-nothing — any failure rolls back all three writes.
- **Edit flow:** read old items → compute per-product/godown qty diff vs new items → apply delta to `godown_stock` → recompute totals (implemented in `Invoices.handleEditSave`).
- **Modules going through this pattern:** Purchase, Invoices (create + edit), Sales Returns, SO→Invoice conversion, Godown Transfer.
- **Integrity constraint:** `stock_movements` has a partial unique index on `(reference_type, reference_id, product_id, movement_type)` to prevent duplicate postings on retries (migration `20260417000003_stock_integrity_constraints.sql`).
- **`sales_order_items.godown_id`** column carries the per-line godown selection from SO into Invoice conversion (same migration).

## Website Backend (Supabase shared with House of Remedies website)
This ERP's Supabase is also the backend for the customer-facing website. The following objects were added in migrations `20260502000001..05`:
- **`settings`** — generic key/value table. Seeded rows: `shopping_mode`, `website_open`.
- **`product_web_meta`** — per-product website metadata: `slug` (unique), `tagline`, `vastu_direction[]`, `vastu_benefit[]`, `placement_note`, `where_to_use`, `expected_results`, `is_published`.
- **`product_images`** — multi-image gallery per product: `url`, `alt_text`, `sort_order`, `is_primary` (DB-enforced one-primary-per-product partial unique index).
- **`inquiry_leads`** — public lead form submissions: `name`, `phone`, `email`, `product_id`, `product_name`, `message`, `status` ('new'|'read'|'replied'|'closed'), `source`.
- **New product columns**: `short_description`, `specs` (jsonb), `tags` (text[]), `show_on_website` (boolean default true).
- **Customer email**: unique partial index on `lower(email)` + `AFTER INSERT` trigger on `auth.users` that auto-creates a B2C `customers` row (lowercased email) on website signup. Both this trigger and the existing `handle_new_user` trigger now key on `raw_user_meta_data->>'signup_source'='website'` to distinguish website customers from ERP staff.
- **`is_erp_staff()`** helper function — `true` iff `auth.uid()` has a `user_profiles` row. ERP staff have one; website customers (signed up with `signup_source=website`) do not. Used by the rewritten ERP-side policies to keep website customers locked OUT of staff-only data.
- **ERP-side RLS hardened** (migration 0005): every legacy `"Authenticated users can ..."` policy on customer-sensitive tables (customers, sales_orders, invoices, delivery_challans, customer_rate_cards, payments, ledger/journal_entries, crm_*, etc.) and on catalog write paths was replaced with `"ERP staff can ..."` requiring `is_erp_staff()`. ERP UI behavior is identical (staff still see/edit everything); website customers can only access their self-scoped data via the new policies in migration 0004.
- **Website-facing RLS** (additive — does NOT replace existing ERP staff policies):
  - `customers` — self read/update/insert (B2C only via website to prevent self-promotion to B2B)
  - `sales_orders`, `invoices`, `delivery_challans`, `customer_rate_cards` — self read by `auth.jwt() ->> 'email'`
  - `products`, `product_web_meta`, `product_variants`, `product_images`, `settings` — public read for `anon, authenticated` (products require `is_active AND show_on_website`; web_meta requires `is_published`)
  - `inquiry_leads` — public insert, self read
  - Phase 4: `sales_orders` + `sales_order_items` self insert (status restricted to 'pending'/'draft')

See `WEBSITE_UPDATES_NEEDED.md` for the corresponding changes the website team must make on the frontend (multi-image gallery, show_on_website filter, website_open switch, etc.).

## Deployment
- Static site deployment via `npm run build` → `dist/` directory
