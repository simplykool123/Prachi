alter table public.godowns
  add column if not exists is_default boolean not null default false;

-- Optional: set your main warehouse as default by replacing <MAIN_WAREHOUSE_ID>
-- update public.godowns set is_default = true where id = '<MAIN_WAREHOUSE_ID>';

-- Safety fallback: if no default exists, mark the first active godown as default
with first_active as (
  select id
  from public.godowns
  where is_active = true
  order by created_at asc
  limit 1
)
update public.godowns g
set is_default = true
from first_active
where g.id = first_active.id
  and not exists (
    select 1 from public.godowns gd where gd.is_default = true and gd.is_active = true
  );

-- Ensure at most one active default godown
create unique index if not exists uq_godowns_single_default
  on public.godowns ((is_default))
  where is_default = true and is_active = true;
