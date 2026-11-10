-- CreatorOS waitlist storage + queue mechanic.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> Run.
-- Safe to re-run: every statement is idempotent.

create table if not exists public.waitlist (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  position      bigint generated always as identity,
  email         text not null,
  name          text,
  referral_code text not null default encode(gen_random_bytes(5),'hex'),
  referred_by   text,
  source        text
);

-- One row per person, case-insensitively.
create unique index if not exists waitlist_email_unique
  on public.waitlist (lower(email));
create unique index if not exists waitlist_referral_code_unique
  on public.waitlist (referral_code);
create index if not exists waitlist_referred_by_idx
  on public.waitlist (referred_by);

-- Nothing is readable with the public key. RLS is what makes it safe to ship
-- the anon key in client JavaScript.
alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon;

-- ---------------------------------------------------------------------------
-- Signup goes through one function rather than a direct table insert, so the
-- caller can be handed back *only* its own position and code. A plain insert
-- cannot return data without a SELECT policy, and any SELECT policy broad
-- enough to read your own row is broad enough to enumerate the list.
-- SECURITY DEFINER runs as the owner; the function body is the whole API.
-- ---------------------------------------------------------------------------
create or replace function public.join_waitlist(
  p_email text,
  p_name  text default null,
  p_ref   text default null,
  p_source text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_row   public.waitlist%rowtype;
  v_ahead bigint;
  v_total bigint;
  v_refs  bigint;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 320 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  insert into public.waitlist (email, name, referred_by, source)
  values (v_email, nullif(trim(coalesce(p_name,'')),''), nullif(trim(coalesce(p_ref,'')),''), p_source)
  on conflict (lower(email)) do update
    set email = public.waitlist.email      -- no-op so RETURNING still fires
  returning * into v_row;

  -- Referrals pull you up the queue: each one counts as five places.
  select count(*) into v_refs
    from public.waitlist where referred_by = v_row.referral_code;

  select count(*) into v_ahead
    from public.waitlist where position < v_row.position;

  select count(*) into v_total from public.waitlist;

  return json_build_object(
    'position',  greatest(1, (v_ahead + 1) - (v_refs * 5)),
    'raw_place', v_ahead + 1,
    'referrals', v_refs,
    'total',     v_total,
    'code',      v_row.referral_code
  );
end;
$$;

revoke all on function public.join_waitlist(text,text,text,text) from public;
grant execute on function public.join_waitlist(text,text,text,text) to anon;

-- Public, non-identifying count for the hero proof line.
create or replace function public.waitlist_count()
returns bigint
language sql
security definer
set search_path = public
as $$ select count(*) from public.waitlist $$;

revoke all on function public.waitlist_count() from public;
grant execute on function public.waitlist_count() to anon;

-- Read the list yourself from the dashboard Table Editor, or with the
-- service_role key from a trusted server. Never put service_role in the page.
