-- Run this ONCE in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- If you already created your own `profiles` table, send me its columns first and I'll match this to it.

-- 1) one profile row per account (the login itself lives in Supabase's built-in auth.users)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'customer',
  full_name   text,
  student_id  text unique,
  email       text,
  phone       text,
  created_at  timestamptz not null default now()
);

-- 2) Row Level Security: this is what actually protects your data
alter table public.profiles enable row level security;

create policy "users read their own profile"
  on public.profiles for select using (auth.uid() = id);

-- users may edit ONLY their name and phone. Nobody can change `role` from the browser,
-- so a buyer can never turn themselves into a seller or admin.
create policy "users update their own profile"
  on public.profiles for update using (auth.uid() = id);
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
-- (no insert/delete policies: profile rows are only created by the trigger below)

-- 3) the profile is created ONLY after the buyer has entered the e-mailed code.
--    Self-service sign-ups are always 'customer'. Sellers and admins are added by an admin later.
create or replace function public.handle_verified_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, student_id, email, phone)
  values (
    new.id,
    'customer',
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'student_id',
    new.email,
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_verified on auth.users;
drop trigger if exists on_auth_user_inserted_verified on auth.users;

create trigger on_auth_user_verified               -- code entered correctly
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_verified_user();

create trigger on_auth_user_inserted_verified      -- covers "Confirm email" being switched off
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.handle_verified_user();

-- 4) helpers the pages call (they only ever see verified accounts, because profiles only holds those)
create or replace function public.email_for_student_id(sid text)
returns text language sql security definer set search_path = public stable as $$
  select email from public.profiles where student_id = sid limit 1;
$$;

create or replace function public.student_id_available(sid text)
returns boolean language sql security definer set search_path = public stable as $$
  select not exists (select 1 from public.profiles where student_id = sid);
$$;

grant execute on function public.email_for_student_id(text) to anon, authenticated;
grant execute on function public.student_id_available(text) to anon, authenticated;