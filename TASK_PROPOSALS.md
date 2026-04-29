# Codebase Task Proposals

## 1) Typo fix task
**Task:** Rename migration file `20260419124535_fix_po_cancel_and_renumber_documents_v2.sql` to use the full word `purchase_order` (for consistency with other migration names and readability in audit trails).

**Why this looks like a typo/inconsistent abbreviation:** Most migration filenames use fully descriptive names, but this one uses `po` shorthand that can be read ambiguously.

---

## 2) Bug fix task
**Task:** Fix CRM document deletion so storage cleanup uses `file_path` (bucket-relative path), not `file_url` (public URL).

**Evidence:**
- Upload stores both `file_url` and `file_path` in `customer_documents`.
- Delete flow currently passes `doc.file_url` into `confirmDeleteDoc.file_path`, so `storage.remove()` is called with a URL string and will not remove the object.

**Likely fix:** In the document card delete button handler, pass `doc.file_path` instead of `doc.file_url`.

---

## 3) Code comment/documentation discrepancy task
**Task:** Update README to match current code structure and navigation components.

**Evidence of mismatch:** README claims `src/App.tsx` swapped `dispatch`/`courier` page routing and references a `pages/Dispatch.tsx` file, but this repo currently has `src/pages/Courier.tsx` and no `src/pages/Dispatch.tsx`.

**Likely fix:** Revise the “What Was Fixed” list to reflect current pages/modules and remove stale references.

---

## 4) Test improvement task
**Task:** Add a regression test for CRM document deletion path handling.

**What to test:**
- Given a document record with both `file_url` and `file_path`, verify delete flow calls `supabase.storage.from('customer-files').remove([file_path])`.
- Verify DB row delete still runs and UI refreshes.

**Why this matters:** This prevents reintroducing orphaned storage files and ensures a high-impact workflow (customer docs) remains correct.
