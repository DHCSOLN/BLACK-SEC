
comment on table public.journal_entries is 'LOCAL READ MODEL / SHADOW ONLY. SOLN Central Bank ledger is authoritative.';
alter table public.journal_entries add column soln_posting_status text not null default 'pending_soln_post' check (soln_posting_status in ('pending_soln_post','soln_ledger_posted','soln_rejected'));
alter table public.journal_entries add column soln_ref text;
alter table public.std_instructions add column soln_posting_status text not null default 'not_posted' check (soln_posting_status in ('not_posted','queued','soln_ledger_posted','soln_rejected'));
alter table public.std_instructions add column external_bank_status text not null default 'not_settled' check (external_bank_status in ('not_settled','external_settlement_confirmed','external_settlement_failed'));
alter table public.std_instructions add column soln_ref text;

create table public.soln_connector_state (
  id int primary key default 1 check (id = 1),
  environment text not null default 'unconfigured' check (environment in ('unconfigured','sandbox','production')),
  status text not null default 'not_verified' check (status in ('not_verified','verified','error')),
  last_check_at timestamptz,
  last_error text,
  api_version text,
  updated_at timestamptz not null default now()
);
insert into public.soln_connector_state(id) values (1);
grant select on public.soln_connector_state to authenticated;
grant all on public.soln_connector_state to service_role;
alter table public.soln_connector_state enable row level security;
create policy "scs view" on public.soln_connector_state for select to authenticated using (public.is_staff(auth.uid()));

create table public.soln_account_mappings (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid references public.enterprises(id) on delete cascade,
  subject_kind text not null check (subject_kind in ('enterprise','investor')),
  user_id uuid,
  local_account_id uuid references public.ledger_accounts(id),
  currency text not null references public.currencies(code),
  soln_account_ref text,
  sync_status text not null default 'pending_sync' check (sync_status in ('pending_sync','synced','error')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (enterprise_id, subject_kind, user_id, currency)
);
grant select, insert, update on public.soln_account_mappings to authenticated;
grant all on public.soln_account_mappings to service_role;
alter table public.soln_account_mappings enable row level security;
create policy "sam view" on public.soln_account_mappings for select to authenticated using ((enterprise_id is not null and public.can_view_ent(enterprise_id)) or user_id = auth.uid());
create policy "sam write" on public.soln_account_mappings for all to authenticated using (public.has_role(auth.uid(),'financial_ops') or public.has_role(auth.uid(),'founding_admin')) with check (public.has_role(auth.uid(),'financial_ops') or public.has_role(auth.uid(),'founding_admin'));

create table public.soln_balance_cache (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references public.soln_account_mappings(id) on delete cascade,
  currency text not null,
  balance numeric(24,6) not null,
  as_of timestamptz not null,
  source text not null default 'soln_ledger',
  fetched_at timestamptz not null default now()
);
grant select on public.soln_balance_cache to authenticated;
grant all on public.soln_balance_cache to service_role;
alter table public.soln_balance_cache enable row level security;
create policy "sbc view" on public.soln_balance_cache for select to authenticated using (exists (select 1 from public.soln_account_mappings m where m.id = mapping_id and ((m.enterprise_id is not null and public.can_view_ent(m.enterprise_id)) or m.user_id = auth.uid())));

create table public.soln_outbox (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  kind text not null check (kind in ('create_instruction','post_journal_event','sync_account','query_confirmation')),
  enterprise_id uuid,
  ref_id uuid,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','sent','acknowledged','failed','blocked_not_verified')),
  attempts int not null default 0,
  last_error text,
  soln_ref text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.soln_outbox to authenticated;
grant all on public.soln_outbox to service_role;
alter table public.soln_outbox enable row level security;
create policy "so view" on public.soln_outbox for select to authenticated using (public.has_role(auth.uid(),'financial_ops') or public.has_role(auth.uid(),'founding_admin') or public.has_role(auth.uid(),'auditor'));

create table public.soln_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed boolean not null default false,
  process_error text,
  received_at timestamptz not null default now()
);
grant select on public.soln_webhook_events to authenticated;
grant all on public.soln_webhook_events to service_role;
alter table public.soln_webhook_events enable row level security;
create policy "swe view" on public.soln_webhook_events for select to authenticated using (public.has_role(auth.uid(),'financial_ops') or public.has_role(auth.uid(),'founding_admin') or public.has_role(auth.uid(),'auditor'));

create table public.soln_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('completed','blocked_not_verified','failed')),
  matched int not null default 0,
  mismatched int not null default 0,
  details jsonb,
  started_by uuid,
  created_at timestamptz not null default now()
);
grant select on public.soln_reconciliation_runs to authenticated;
grant all on public.soln_reconciliation_runs to service_role;
alter table public.soln_reconciliation_runs enable row level security;
create policy "srr view" on public.soln_reconciliation_runs for select to authenticated using (public.is_staff(auth.uid()));

-- Enqueue outbox events automatically (idempotent references)
create or replace function public.soln_enqueue_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'journal_entries' then
    insert into public.soln_outbox(idempotency_key,kind,enterprise_id,ref_id,payload)
    values ('JE-' || new.idempotency_key, 'post_journal_event', new.enterprise_id, new.id, jsonb_build_object('entry_id', new.id, 'memo', new.memo, 'idempotency_key', new.idempotency_key)) on conflict do nothing;
  elsif tg_table_name = 'std_instructions' then
    insert into public.soln_outbox(idempotency_key,kind,enterprise_id,ref_id,payload)
    values ('STD-' || new.idempotency_key, 'create_instruction', new.enterprise_id, new.id, to_jsonb(new)) on conflict do nothing;
    update public.std_instructions set soln_posting_status='queued' where id=new.id;
  elsif tg_table_name = 'ledger_accounts' then
    insert into public.soln_account_mappings(enterprise_id,subject_kind,local_account_id,currency) values (new.enterprise_id,'enterprise',new.id,new.currency) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger soln_enq_je after insert on public.journal_entries for each row execute function public.soln_enqueue_trg();
create trigger soln_enq_std after insert on public.std_instructions for each row execute function public.soln_enqueue_trg();
create trigger soln_enq_la after insert on public.ledger_accounts for each row execute function public.soln_enqueue_trg();
insert into public.soln_account_mappings(enterprise_id,subject_kind,local_account_id,currency) select enterprise_id,'enterprise',id,currency from public.ledger_accounts on conflict do nothing;

-- SETTLED in production now also requires the SOLN connector to be verified
create or replace function public.transition_std(_id uuid, _to text, _external_ref text default null, _note text default null, _quote uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.std_instructions; q public.fx_quotes; v_status text;
begin
  if not (public.has_role(auth.uid(),'financial_ops') or public.has_role(auth.uid(),'founding_admin')) then raise exception 'Financial operations role required'; end if;
  select * into s from public.std_instructions where id=_id for update;
  if s.id is null then raise exception 'Not found'; end if;
  if not public.std_allowed(s.state, _to) then raise exception 'Illegal transition % -> %', s.state, _to; end if;
  if _to = 'QUOTED' then
    if _quote is null then raise exception 'FX quote required for QUOTED'; end if;
    select * into q from public.fx_quotes where id=_quote;
    if q.expires_at < now() then raise exception 'FX quote expired'; end if;
  end if;
  if _to in ('FUNDED','SETTLED') then
    if coalesce(trim(_external_ref),'') = '' then raise exception '% requires external confirmation reference', _to; end if;
    select status into v_status from public.soln_connector_state where id=1;
    if s.is_test then
      if _external_ref not like 'MOCK-%' then raise exception 'Test-mode instructions accept only MOCK- confirmations from the mock adapter'; end if;
    elsif v_status <> 'verified' then raise exception 'SOLN ledger connector not yet verified';
    end if;
  end if;
  update public.std_instructions set state=_to, external_ref=coalesce(_external_ref, external_ref), fx_quote_id=coalesce(_quote, fx_quote_id), updated_at=now() where id=_id;
  insert into public.std_transitions(instruction_id,from_state,to_state,external_ref,note,actor) values (_id,s.state,_to,_external_ref,_note,auth.uid());
end $$;

-- Provisioning module for SOLN ledger account sync
create or replace function public.provision_enterprise(_ent uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m text;
begin
  if not public.can_manage_ent(_ent) then raise exception 'Not authorized'; end if;
  foreach m in array array['enterprise_id','dashboard','governance_documents','cap_table','shares_archive','multi_currency_accounts','soln_ledger_sync','disclosure_workspace','performance_profile','compliance_calendar','reporting','notifications'] loop
    insert into public.provisioning_tasks(enterprise_id,module) values (_ent,m) on conflict do nothing;
    if (select status from public.provisioning_tasks where enterprise_id=_ent and module=m) <> 'completed' then
      if m = 'soln_ledger_sync' then
        insert into public.soln_outbox(idempotency_key,kind,enterprise_id,ref_id,payload)
          values ('SYNC-ENT-' || _ent, 'sync_account', _ent, _ent, jsonb_build_object('enterprise_id', _ent)) on conflict do nothing;
        update public.provisioning_tasks set attempts=attempts+1, updated_at=now(),
          status = case when (select status from public.soln_connector_state where id=1) = 'verified' then 'completed' else 'pending' end,
          last_error = case when (select status from public.soln_connector_state where id=1) = 'verified' then null else 'Queued: SOLN ledger connector not yet verified' end
          where enterprise_id=_ent and module=m;
      else
        perform public.run_provision_module(_ent, m);
      end if;
    end if;
  end loop;
  update public.enterprises set status = case when exists (select 1 from public.provisioning_tasks where enterprise_id=_ent and status='failed') then 'provisioning' else 'pending_review' end,
    registry_membership_status = 'pending' where id=_ent and status in ('draft','provisioning');
end $$;

update public.integration_configs set notes='SOLN Central Bank / Global SOLN Reserve ledger (authoritative). CONNECTOR NOT YET VERIFIED. Configure SOLN_LEDGER_BASE_URL, SOLN_LEDGER_API_KEY, SOLN_WEBHOOK_SECRET.' where provider='soln_central_bank';
