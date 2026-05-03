# House of Remedies — Website Updates Needed

This document is for the **website's Replit agent**. It lists changes the website
codebase needs in order to stay in sync with the latest ERP backend upgrade
(Supabase project `gtyxjbpbsvzdqfiamnvh`).

The ERP team has applied a set of database migrations that **add new tables and
columns** the website can now take advantage of. Your earlier handoff doc
(under "What we explicitly do NOT need from the backend") said you didn't want
these — but the ERP owner has changed his mind: he wants the website to use
multi-image galleries and to honor a per-product publish toggle. Please update
the website accordingly.

Below is the full list of what changed on the backend, and what you must do on
the frontend to consume it.

---

## 1. Multi-image product gallery (NEW — please add)

A new table `public.product_images` now exists:

| Column      | Type         | Notes                                                       |
| ----------- | ------------ | ----------------------------------------------------------- |
| id          | uuid PK      |                                                             |
| product_id  | uuid FK      | → `products.id` (ON DELETE CASCADE)                         |
| url         | text         | Full Supabase storage URL                                   |
| alt_text    | text         |                                                             |
| sort_order  | int          | Display order (ascending). 0 first.                         |
| is_primary  | boolean      | Exactly one row per product can be `true` (DB-enforced)     |
| created_at  | timestamptz  |                                                             |

RLS: public read is allowed for everyone (anon + authenticated).

**Website tasks:**

- On product **detail pages**: fetch `product_images` for the product, sort by
  `sort_order ASC`, and render as a gallery / carousel. The image marked
  `is_primary = true` should appear first (or be the active slide on load).
- On product **cards / home grid / listing**: prefer the primary image from
  `product_images`. Fall back to `products.image_url` if no `product_images`
  rows exist. (This keeps backward compat with the 1 existing product that
  only has `image_url`.)
- Cache-bust by appending `?v=<created_at>` to gallery URLs if you want.

Suggested query (single round trip):

```ts
const { data: products } = await supabase
  .from('products')
  .select(`
    id, name, selling_price, image_url, short_description,
    product_web_meta(slug, tagline, vastu_direction, vastu_benefit, is_published),
    product_images(url, alt_text, sort_order, is_primary)
  `)
  .eq('is_active', true)
  .eq('show_on_website', true);
```

---

## 2. `show_on_website` per-product toggle (NEW — please filter)

A new boolean column `products.show_on_website` (default `true`) was added.
The ERP team uses it to hide a single product from the website without
deleting it or marking it inactive in inventory.

**Website tasks:**

- Add `.eq('show_on_website', true)` to **every** website query that lists
  products (home grid, listing, search, related, B2B catalog, etc.).
- The RLS policy `products_public_read` already enforces this server-side as
  a safety net (`is_active = true AND COALESCE(show_on_website, true) = true`),
  but adding the explicit filter keeps query plans tight and behaviour
  predictable.

---

## 3. Optional richer product columns (NEW — start using when convenient)

These columns are now on `public.products` (all nullable / safe defaults):

| Column            | Type      | Suggested website use                                |
| ----------------- | --------- | ---------------------------------------------------- |
| short_description | text      | Subtitle on product cards / search results          |
| specs             | jsonb     | Render as a key/value table on detail page          |
| tags              | text[]    | Filter chips, related-product matching              |
| show_on_website   | boolean   | See §2 above                                         |

These are purely additive — render them when present, ignore when null.

---

## 4. Master site switch — `settings.website_open` (NEW)

In addition to the existing `settings` row `key='shopping_mode'`, there is now
a second row `key='website_open'` (default `'on'`).

**Website tasks:**

- On every page load (or via a top-level provider), read both settings.
- If `website_open = 'off'`: render a maintenance / "Back soon" page instead
  of the normal site.
- `shopping_mode` continues to behave exactly as before (controls whether the
  cart / checkout is enabled).

---

## 5. Inquiry leads — `'closed'` is now a valid status

The `inquiry_leads.status` CHECK constraint now accepts:
`'new' | 'read' | 'replied' | 'closed'`.

**Website tasks (only if you display lead status anywhere):**

- If your "My Inquiries" view renders a status badge, add a label/colour for
  `'closed'`. The website still inserts new leads with `status='new'` — no
  change to the submit flow.

---

## 6. Customer signup — REQUIRED metadata flag (CRITICAL)

To distinguish website customers from ERP staff, the website **must** send a
`signup_source: 'website'` flag in the user metadata on every signup. The ERP
backend uses this flag to:

- Skip creating a `user_profiles` row (those are for ERP staff only).
- Trigger the auto-creation of a matching `customers` row (lowercased email,
  category=B2C, is_active=true).

**Without this flag, the new customer will accidentally be treated as ERP staff
and get full read access to the entire ERP database. Do not skip this.**

**Website tasks:**

```ts
await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      signup_source: 'website',   // ⚠️ REQUIRED — do not omit
      name,
      phone,
      city,
    },
  },
});
```

- After signup, you no longer need to do a manual `customers` upsert. The
  backend trigger handles it. (Your old upsert can be removed; if left in
  place it's a safe no-op thanks to `ON CONFLICT (lower(email)) DO NOTHING`.)
- When matching auth user → customer row, always lowercase the email on
  both sides: `.eq('email', user.email.toLowerCase())` or `.ilike('email', user.email)`.

---

## 7. RLS policies are live (NEW)

All the customer self-read / self-update / self-insert and Phase-4 sales-order
self-insert policies from sections 3.2 and 6 of your handoff doc are now in
place. You can stop using the service-role key for customer-facing queries —
the anon key + authenticated session is sufficient for:

- Reading own customer row, sales orders, invoices, delivery challans, rate cards
- Updating own customer profile (B2C only — B2B profiles must be edited in the ERP)
- Inserting new sales orders + items (when you turn shopping mode on)
- Public read of products, product_web_meta (published only), product_variants,
  product_images, settings
- Public insert of inquiry_leads

If your `.env` still references `SUPABASE_SERVICE_ROLE_KEY` for any of these
flows, switch to the anon key.

---

## 8. ERP-side data fixes that affect the website

The following are being handled by the ERP team but you should be aware:

- **5 of 6 existing customers have empty-string emails.** Until backfilled,
  they cannot sign in to the website. The ERP team will collect emails and
  set empties to NULL. New customers from website signups are unaffected.
- **B2B Test Customer** (`b2btest@heer.test`) currently has `category='B2C'`
  with a rate card. Once promoted to `'B2B'` in the ERP, signing in as that
  user will show `₹21,700` with a "B2B" badge on `/products/w-ling-bhairavi-big-2feet`.
- **Only 1 of 90 products has `is_published=true` in `product_web_meta`.** The
  ERP team is adding a metadata editor in their product page to publish more.
  Until then, slug-based URLs only work for that 1 product.

---

## 9. Verification checklist for the website team

After applying the above:

1. Visit `/products` → products with multiple `product_images` rows show all
   images in a gallery on the detail page.
2. Visit `/products` → a product where `show_on_website=false` does NOT appear
   on the home grid, listing, or detail page (404 by slug).
3. Toggle `settings.website_open` to `'off'` in Supabase SQL editor → website
   shows maintenance page. Set back to `'on'` → site returns.
4. Sign up a new test user on the website → confirm a `customers` row exists
   for that lowercased email (via the new trigger).
5. Sign in as `b2btest@heer.test` (after ERP promotes them to B2B) → product
   pages show the B2B rate card price with a "B2B" badge.
6. Submit an inquiry on a product page → `inquiry_leads` row appears with
   `status='new'`.
7. (When shopping mode goes live) place an order → `sales_orders` and
   `sales_order_items` rows are created and visible in My Account.

---

## 10. What did NOT change (still works as before)

- All existing website queries against `customers`, `customer_rate_cards`,
  `sales_orders`, `invoices`, `delivery_challans` remain valid — only
  additive filters (§2) and new selects (§1, §3, §4) are needed.
- `products.image_url` still exists and is still the fallback for products
  with no gallery rows.
- `customer_rate_cards.effective_from` / `effective_to` rules still apply.
- `user_profiles` is still ERP-only and the website should never read or
  write it.
- No new RPCs are required. No `get_b2b_rate` was added.
