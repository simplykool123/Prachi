# Prachi App — Bug Fixes

## How to Apply

### Step 1 — Run the Migration (MOST IMPORTANT)
Open your Supabase project → SQL Editor → paste the contents of:
`supabase/migrations/20260402000001_create_missing_tables.sql`

This creates 6 missing tables and fixes 5 schema bugs.

### Step 2 — Replace Source Files
Copy each fixed file from this folder into your project at the same path.

---

## What Was Fixed

### 🔴 Critical — Would crash or silently fail

| # | File | Bug | Fix |
|---|------|-----|-----|
| 1 | **Migration** | `godowns`, `godown_stock`, `dispatch_entries`, `customer_rates`, `customer_rate_cards`, `customer_last_rates` — 6 tables used in code but never created | Created all 6 tables with RLS, indexes, and seed data |
| 2 | **Migration** | `payments` table missing `invoice_id` column (used by invoiceService) | Added `invoice_id` FK column |
| 3 | **Migration** | `ledger_entries` missing `customer_id` column (used by workflowService) | Added `customer_id` column |
| 4 | **Migration** | `invoices` missing `godown_id` column (used by workflowService stock deduction) | Added `godown_id` FK column |
| 5 | **Migration** | `sales_orders` status constraint didn't allow `'invoiced'` or `'closed'` — used by workflow | Fixed constraint |
| 6 | **Migration** | `company_settings` UPDATE policy used `app_metadata.role` — never set by app | Fixed to check `user_profiles.role` |
| 7 | **services/workflowService.ts** | Ledger inserts used `customer_id` instead of required `party_id` + `party_name` + `account_type` | Fixed all ledger inserts |
| 8 | **services/invoiceService.ts** | `recordPayment()` missing `payment_number` (UNIQUE NOT NULL), `reference_type` (NOT NULL), `party_name` (NOT NULL) — every payment would throw a DB error | Added all required fields + now triggers workflow |
| 9 | **src/App.tsx** | `case 'dispatch'` rendered `<Courier>` and `case 'courier'` rendered `<Dispatch>` — completely swapped | Fixed to correct components |

### 🟡 Moderate — Wrong behaviour

| # | File | Bug | Fix |
|---|------|-----|-----|
| 10 | **services/salesOrderService.ts** | Used `rateService` (writes to `customer_last_rates`) while all pages use `rateCardService` (writes to `customer_product_last_rates`) — rates never visible cross-module | Unified to use `rateCardService` |
| 11 | **services/workflowService.ts** | Same split rate service issue | Unified to use `rateCardService` |
| 12 | **lib/stockService.ts** | `await supabase.rpc !== undefined && await supabase.from(...)` — nonsensical, always `true`, broken async | Replaced with clean async/await |
| 13 | **types/index.ts** | `CustomerLastRate` interface defined twice with different shapes — TypeScript conflict | Merged into one interface, added `CustomerProductLastRate` alias |
| 14 | **contexts/AuthContext.tsx** | `accountant` role had no `canAccessSales` or `canAccessInventory` — accountants saw a blank app | Accountants now get read access to sales + inventory |
| 15 | **pages/Courier.tsx** | Courier/dispatch numbering alignment required cleanup to keep generated references consistent | Fixed generated references to follow the expected format |
| 16 | **components/layout/Sidebar.tsx** | "Shipments" badge counted `courier_entries` (wrong table), Dispatch page had no nav link at all | Badge now counts `dispatch_entries`, added "Dispatch" nav item |

---

## Table Map (after fixes)

| Table | Used By |
|-------|---------|
| `godowns` | Godowns page, godownService, workflowService |
| `godown_stock` | Godowns page, godownService, stockService |
| `dispatch_entries` | Dispatch page, Dashboard |
| `courier_entries` | Courier page, Sidebar badge |
| `customer_rate_cards` | rateCardService (smart rate memory) |
| `customer_product_last_rates` | rateCardService (last used rate per customer-product) |
| `customer_rates` | rateService (simple fixed rates) |
| `customer_last_rates` | rateService (simple last rates) |

> **Note:** `rateService` and `rateCardService` are now unified — all pages write to `customer_product_last_rates` via `rateCardService`. The `rateService` + its two tables still exist as backup.
