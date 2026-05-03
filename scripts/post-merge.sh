#!/bin/bash
# Post-merge setup for the ERP repo.
#
# Runs after a task agent's work is merged into main. Keeps things minimal:
# - Reinstall npm deps in case package.json changed.
#
# Supabase migrations live under supabase/migrations/ but the Supabase project
# is EXTERNAL (gtyxjbpbsvzdqfiamnvh) and applied manually via the Supabase CLI
# or SQL editor — we deliberately do NOT push them automatically here.
set -e

if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

echo "post-merge: done"
