create table public.site_disclaimers (
  page text primary key,
  body text not null default '',
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
grant select on public.site_disclaimers to anon, authenticated;
grant insert, update, delete on public.site_disclaimers to authenticated;
grant all on public.site_disclaimers to service_role;
alter table public.site_disclaimers enable row level security;
create policy "read enabled or admin" on public.site_disclaimers for select to anon, authenticated using (enabled or public.has_role(auth.uid(),'founding_admin'));
create policy "admin insert" on public.site_disclaimers for insert to authenticated with check (public.has_role(auth.uid(),'founding_admin'));
create policy "admin update" on public.site_disclaimers for update to authenticated using (public.has_role(auth.uid(),'founding_admin')) with check (public.has_role(auth.uid(),'founding_admin'));
create policy "admin delete" on public.site_disclaimers for delete to authenticated using (public.has_role(auth.uid(),'founding_admin'));