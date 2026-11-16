
create table public.trade_settlements (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null unique references public.trades(id),
  enterprise_id uuid not null references public.enterprises(id),
  status text not null check (status in ('sandbox_not_settled','awaiting_verified_execution','soln_instruction_queued','soln_ledger_posted','soln_rejected','archive_event_proposed','exception_holder_unmapped')),
  external_bank_status text not null default 'not_settled' check (external_bank_status in ('not_settled','external_settlement_confirmed','external_settlement_failed')),
  idempotency_key text unique,
  soln_ref text,
  share_event_id uuid references public.share_events(id),
  performance_record_id uuid references public.performance_records(id),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.trade_settlements to authenticated;
grant all on public.trade_settlements to service_role;
alter table public.trade_settlements enable row level security;
create policy "ts view" on public.trade_settlements for select to authenticated using (public.can_view_ent(enterprise_id));
create trigger a_ts after insert or update on public.trade_settlements for each row execute function public.audit_trg();

create or replace function public.trade_settlement_init_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.trade_settlements(trade_id, enterprise_id, status)
  values (new.id, new.enterprise_id, case when new.sandbox then 'sandbox_not_settled' else 'awaiting_verified_execution' end);
  return new;
end $$;
create trigger trade_settlement_init after insert on public.trades for each row execute function public.trade_settlement_init_trg();
insert into public.trade_settlements(trade_id, enterprise_id, status) select id, enterprise_id, 'sandbox_not_settled' from public.trades on conflict do nothing;

create or replace function public.queue_trade_settlement(_trade uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.trades; s public.trade_settlements; v_key text; v_conn text; v_broker boolean;
begin
  if not (public.has_role(auth.uid(),'financial_ops') or public.has_role(auth.uid(),'founding_admin')) then raise exception 'Financial operations role required'; end if;
  select * into t from public.trades where id=_trade;
  select * into s from public.trade_settlements where trade_id=_trade for update;
  if t.id is null or s.id is null then raise exception 'Trade not found'; end if;
  if t.sandbox then raise exception 'Sandbox trades are simulations and cannot be sent for SOLN settlement'; end if;
  if s.status <> 'awaiting_verified_execution' then raise exception 'Settlement already %', s.status; end if;
  select status into v_conn from public.soln_connector_state where id=1;
  if v_conn <> 'verified' then raise exception 'SOLN ledger connector not yet verified'; end if;
  select (mode='live' and verified) into v_broker from public.integration_configs where provider='broker_ats_partner';
  if not coalesce(v_broker,false) then raise exception 'No verified broker/ATS execution partner'; end if;
  v_key := 'TRADE-' || t.id;
  insert into public.soln_outbox(idempotency_key,kind,enterprise_id,ref_id,payload)
  values (v_key,'create_instruction',t.enterprise_id,t.id,jsonb_build_object('type','trade_settlement','trade_id',t.id,'class_id',t.class_id,'price',t.price,'quantity',t.quantity))
  on conflict do nothing;
  update public.trade_settlements set status='soln_instruction_queued', idempotency_key=v_key, updated_at=now() where id=s.id;
end $$;

-- Called only by the signed SOLN webhook handler (service role).
create or replace function public.apply_trade_settlement_event(_idem text, _event text, _soln_ref text default null, _reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare s public.trade_settlements; t public.trades; b public.orders; se public.orders; v_from uuid; v_to uuid; v_ev uuid; v_pr uuid;
begin
  select * into s from public.trade_settlements where idempotency_key=_idem for update;
  if s.id is null then return 'not_found'; end if;
  if _event = 'settlement.external_confirmed' then
    update public.trade_settlements set external_bank_status='external_settlement_confirmed', updated_at=now() where id=s.id; return 'external_confirmed';
  elsif _event = 'settlement.external_failed' then
    update public.trade_settlements set external_bank_status='external_settlement_failed', last_error=_reason, updated_at=now() where id=s.id; return 'external_failed';
  elsif _event = 'instruction.rejected' then
    update public.trade_settlements set status='soln_rejected', last_error=_reason, updated_at=now() where id=s.id; return 'rejected';
  elsif _event <> 'instruction.posted' then return 'ignored';
  end if;
  if s.status not in ('soln_instruction_queued','exception_holder_unmapped') then return 'already_' || s.status; end if;
  select * into t from public.trades where id=s.trade_id;
  select * into b from public.orders where id=t.buy_order;
  select * into se from public.orders where id=t.sell_order;
  select id into v_from from public.shareholders where enterprise_id=t.enterprise_id and user_id=se.user_id limit 1;
  select id into v_to from public.shareholders where enterprise_id=t.enterprise_id and user_id=b.user_id limit 1;
  update public.trade_settlements set status='soln_ledger_posted', soln_ref=coalesce(_soln_ref,soln_ref), updated_at=now() where id=s.id;
  if v_from is null or v_to is null then
    update public.trade_settlements set status='exception_holder_unmapped', last_error='Buyer or seller has no shareholder record', updated_at=now() where id=s.id;
    return 'exception_holder_unmapped';
  end if;
  insert into public.share_events(enterprise_id,class_id,event_type,from_holder,to_holder,quantity,price_per_share,notes)
  values (t.enterprise_id,t.class_id,'transfer',v_from,v_to,t.quantity,t.price,'Proposed from SOLN-posted trade ' || t.id || ' (SOLN ref ' || coalesce(_soln_ref,'n/a') || '). Requires registrar approval.')
  returning id into v_ev;
  insert into public.performance_records(enterprise_id,period,metric,value,narrative,verification,visibility)
  values (t.enterprise_id,to_char(now(),'YYYY-"Q"Q'),'share_change',t.quantity,'Secondary transfer posted on SOLN ledger; Shares Archive transfer pending registrar approval.','enterprise_reported','private')
  returning id into v_pr;
  update public.trade_settlements set status='archive_event_proposed', share_event_id=v_ev, performance_record_id=v_pr, last_error=null, updated_at=now() where id=s.id;
  return 'archive_event_proposed';
end $$;
revoke execute on function public.apply_trade_settlement_event(text,text,text,text) from public, anon, authenticated;
grant execute on function public.apply_trade_settlement_event(text,text,text,text) to service_role;
