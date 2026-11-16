
-- BLACK SEC core schema (PRD-BSEC-2026-001)
create type public.app_role as enum ('founding_admin','registrar','compliance_officer','financial_ops','auditor','investor');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  mfa_enrolled boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id
    and role in ('founding_admin','registrar','compliance_officer','financial_ops','auditor'))
$$;

create policy "own profile or staff" on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid());
create policy "own roles or staff" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid()));

-- Audit log (append-only)
create table public.audit_log (
  id bigserial primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  enterprise_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "audit readers" on public.audit_log for select to authenticated using (
  public.has_role(auth.uid(),'founding_admin') or public.has_role(auth.uid(),'auditor') or public.has_role(auth.uid(),'compliance_officer') or public.has_role(auth.uid(),'registrar'));

create or replace function public.audit_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_log(actor, action, entity, entity_id, enterprise_id, details)
  values (auth.uid(), tg_op, tg_table_name, r->>'id', nullif(coalesce(r->>'enterprise_id', case when tg_table_name='enterprises' then r->>'id' end),'')::uuid, r);
  return coalesce(new, old);
end $$;

-- Enterprises (tenants)
create table public.enterprises (
  id uuid primary key default gen_random_uuid(),
  enterprise_code text unique,
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  trade_name text,
  entity_type text not null check (entity_type in ('corporation','llc','sole_proprietor','public_benefit_corporation')),
  jurisdiction text not null check (char_length(jurisdiction) between 2 and 100),
  registration_number text,
  address text,
  status text not null default 'draft' check (status in ('draft','provisioning','pending_review','active','suspended','rejected')),
  membership_accepted boolean not null default false,
  membership_accepted_at timestamptz,
  standards_version text,
  equity_mode text check (equity_mode in ('new','import')),
  ledger_currencies text[] not null default '{LND,USD}',
  registry_membership_status text not null default 'not_member' check (registry_membership_status in ('not_member','pending','member','suspended')),
  exchange_registration_status text not null default 'not_registered',
  public_summary text,
  is_demo boolean not null default false,
  is_template boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);
create table public.enterprise_members (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('founder','secretary','officer')),
  unique (enterprise_id, user_id, role)
);
create or replace function public.is_member(_user_id uuid, _ent uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.enterprise_members where user_id = _user_id and enterprise_id = _ent)
$$;
create or replace function public.can_view_ent(_ent uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff(auth.uid()) or public.is_member(auth.uid(), _ent)
$$;
create or replace function public.can_manage_ent(_ent uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(),'founding_admin') or public.has_role(auth.uid(),'registrar') or public.is_member(auth.uid(), _ent)
$$;

grant select, insert, update on public.enterprises to authenticated;
grant all on public.enterprises to service_role;
alter table public.enterprises enable row level security;
create policy "view enterprises" on public.enterprises for select to authenticated using (
  public.can_view_ent(id) or status = 'active' or is_template);
create policy "create draft enterprise" on public.enterprises for insert to authenticated with check (created_by = auth.uid() and status = 'draft');
create policy "update draft own or registrar" on public.enterprises for update to authenticated using (
  (public.is_member(auth.uid(), id) and status = 'draft') or public.has_role(auth.uid(),'founding_admin') or public.has_role(auth.uid(),'registrar'));

grant select on public.enterprise_members to authenticated;
grant all on public.enterprise_members to service_role;
alter table public.enterprise_members enable row level security;
create policy "view members" on public.enterprise_members for select to authenticated using (user_id = auth.uid() or public.can_view_ent(enterprise_id));

create table public.beneficial_owners (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id) on delete cascade,
  full_name text not null,
  ownership_pct numeric(7,4) not null check (ownership_pct >= 0 and ownership_pct <= 100),
  control_role text,
  kyc_status text not null default 'pending' check (kyc_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.beneficial_owners to authenticated;
grant all on public.beneficial_owners to service_role;
alter table public.beneficial_owners enable row level security;
create policy "bo view" on public.beneficial_owners for select to authenticated using (public.can_view_ent(enterprise_id));
create policy "bo write" on public.beneficial_owners for all to authenticated using (public.can_manage_ent(enterprise_id)) with check (public.can_manage_ent(enterprise_id));

-- Protected documents with SHA-256
create table public.enterprise_documents (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id) on delete cascade,
  title text not null,
  doc_type text not null,
  content text not null default '',
  sha256 text,
  status text not null default 'draft' check (status in ('draft','pending_signature','signed','superseded')),
  signed_by uuid,
  signed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create or replace function public.doc_hash_trg() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.status = 'signed' and (new.content <> old.content or new.title <> old.title) then
    raise exception 'Signed documents are immutable';
  end if;
  new.sha256 := encode(sha256(convert_to(new.title || '|' || new.doc_type || '|' || new.content, 'UTF8')), 'hex');
  return new;
end $$;
create trigger doc_hash before insert or update on public.enterprise_documents for each row execute function public.doc_hash_trg();
grant select, insert, update on public.enterprise_documents to authenticated;
grant all on public.enterprise_documents to service_role;
alter table public.enterprise_documents enable row level security;
create policy "doc view" on public.enterprise_documents for select to authenticated using (public.can_view_ent(enterprise_id));
create policy "doc insert" on public.enterprise_documents for insert to authenticated with check (public.can_manage_ent(enterprise_id));
create policy "doc update unsigned" on public.enterprise_documents for update to authenticated using (public.can_manage_ent(enterprise_id) and status <> 'signed');

create table public.provisioning_tasks (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id) on delete cascade,
  module text not null,
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  attempts int not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  unique (enterprise_id, module)
);
grant select on public.provisioning_tasks to authenticated;
grant all on public.provisioning_tasks to service_role;
alter table public.provisioning_tasks enable row level security;
create policy "prov view" on public.provisioning_tasks for select to authenticated using (public.can_view_ent(enterprise_id));

-- Capitalization
create table public.share_classes (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id) on delete cascade,
  name text not null,
  authorized bigint not null check (authorized > 0),
  par_value numeric(20,6) not null default 0 check (par_value >= 0),
  voting_rights text not null default 'one_vote_per_share',
  dividend_rights text,
  liquidation_preference text,
  transfer_restrictions text,
  created_at timestamptz not null default now(),
  unique (enterprise_id, name)
);
grant select, insert, update on public.share_classes to authenticated;
grant all on public.share_classes to service_role;
alter table public.share_classes enable row level security;
create policy "class view" on public.share_classes for select to authenticated using (public.can_view_ent(enterprise_id) or exists (select 1 from public.enterprises e where e.id = enterprise_id and e.status='active'));
create policy "class write" on public.share_classes for insert to authenticated with check (public.can_manage_ent(enterprise_id));
create policy "class update" on public.share_classes for update to authenticated using (public.can_manage_ent(enterprise_id));

create table public.shareholders (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id) on delete cascade,
  name text not null,
  email text,
  user_id uuid,
  holder_type text not null default 'individual' check (holder_type in ('individual','entity')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.shareholders to authenticated;
grant all on public.shareholders to service_role;
alter table public.shareholders enable row level security;
create policy "sh view" on public.shareholders for select to authenticated using (public.can_view_ent(enterprise_id) or user_id = auth.uid());
create policy "sh insert" on public.shareholders for insert to authenticated with check (public.can_manage_ent(enterprise_id));
create policy "sh update" on public.shareholders for update to authenticated using (public.can_manage_ent(enterprise_id));

-- Shares Archive: append-only events
create table public.share_events (
  id uuid primary key default gen_random_uuid(),
  seq bigserial,
  enterprise_id uuid not null references public.enterprises(id),
  class_id uuid not null references public.share_classes(id),
  event_type text not null check (event_type in ('issuance','transfer','cancellation','correction')),
  from_holder uuid references public.shareholders(id),
  to_holder uuid references public.shareholders(id),
  quantity bigint not null check (quantity > 0),
  price_per_share numeric(20,6),
  book_entry_id text,
  certificate_no text,
  notes text,
  corrects_event_id uuid references public.share_events(id),
  status text not null default 'proposed' check (status in ('proposed','approved','rejected')),
  prev_hash text,
  evidence_hash text,
  proposed_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (from_holder is not null or to_holder is not null)
);
grant select on public.share_events to authenticated;
grant all on public.share_events to service_role;
alter table public.share_events enable row level security;
create policy "events view" on public.share_events for select to authenticated using (
  public.can_view_ent(enterprise_id) or exists (select 1 from public.shareholders s where s.user_id = auth.uid() and s.id in (from_holder, to_holder)));

create or replace function public.share_events_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Shares Archive is append-only'; end if;
  if old.status <> 'proposed' then raise exception 'Decided archive events are immutable'; end if;
  if new.quantity <> old.quantity or new.class_id <> old.class_id or new.event_type <> old.event_type
     or new.from_holder is distinct from old.from_holder or new.to_holder is distinct from old.to_holder then
    raise exception 'Archive event content cannot be modified; record a correction entry';
  end if;
  return new;
end $$;
create trigger share_events_guard before update or delete on public.share_events for each row execute function public.share_events_guard();

create or replace function public.holder_balance(_holder uuid, _class uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when to_holder = _holder then quantity else 0 end),0)
       - coalesce(sum(case when from_holder = _holder then quantity else 0 end),0)
  from public.share_events where status='approved' and class_id=_class and (_holder in (to_holder, from_holder))
$$;
create or replace function public.class_issued(_class uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when from_holder is null then quantity when to_holder is null then -quantity else 0 end),0)
  from public.share_events where status='approved' and class_id=_class
$$;

create or replace function public.propose_share_event(_ent uuid, _class uuid, _type text, _from uuid, _to uuid, _qty bigint, _book text default null, _notes text default null, _price numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.can_manage_ent(_ent) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from public.share_classes where id=_class and enterprise_id=_ent) then raise exception 'Class not in enterprise'; end if;
  if _type = 'issuance' and (_from is not null or _to is null) then raise exception 'Issuance requires recipient only'; end if;
  if _type = 'cancellation' and (_from is null or _to is not null) then raise exception 'Cancellation requires holder only'; end if;
  if _type = 'transfer' and (_from is null or _to is null or _from = _to) then raise exception 'Transfer requires distinct holders'; end if;
  if _type = 'correction' then raise exception 'Use propose_correction'; end if;
  insert into public.share_events(enterprise_id,class_id,event_type,from_holder,to_holder,quantity,book_entry_id,notes,price_per_share,proposed_by)
  values (_ent,_class,_type,_from,_to,_qty,_book,_notes,_price,auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.propose_correction(_event uuid, _reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.share_events; v_id uuid;
begin
  select * into e from public.share_events where id=_event;
  if e.id is null or e.status <> 'approved' then raise exception 'Only approved events can be corrected'; end if;
  if not public.can_manage_ent(e.enterprise_id) then raise exception 'Not authorized'; end if;
  if coalesce(trim(_reason),'') = '' then raise exception 'Reason required'; end if;
  insert into public.share_events(enterprise_id,class_id,event_type,from_holder,to_holder,quantity,notes,corrects_event_id,proposed_by)
  values (e.enterprise_id,e.class_id,'correction',e.to_holder,e.from_holder,e.quantity,_reason,e.id,auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.decide_share_event(_event uuid, _approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare e public.share_events; v_prev text; v_auth bigint; v_issued bigint; v_bal bigint;
begin
  if not (public.has_role(auth.uid(),'registrar') or public.has_role(auth.uid(),'founding_admin')) then raise exception 'Registrar approval required'; end if;
  select * into e from public.share_events where id=_event for update;
  if e.status <> 'proposed' then raise exception 'Event already decided'; end if;
  if not _approve then
    update public.share_events set status='rejected', decided_by=auth.uid(), decided_at=now() where id=_event; return;
  end if;
  if e.event_type = 'issuance' and not exists (select 1 from public.enterprise_documents where enterprise_id=e.enterprise_id and doc_type='authorization_resolution' and status='signed') then
    raise exception 'Issuance requires a signed authorization resolution';
  end if;
  perform 1 from public.share_classes where id=e.class_id for update;
  if e.from_holder is null then
    select authorized into v_auth from public.share_classes where id=e.class_id;
    v_issued := public.class_issued(e.class_id);
    if v_issued + e.quantity > v_auth then raise exception 'Exceeds authorized shares (% issued of % authorized)', v_issued, v_auth; end if;
  else
    v_bal := public.holder_balance(e.from_holder, e.class_id);
    if v_bal < e.quantity then raise exception 'Insufficient holder balance (% available)', v_bal; end if;
  end if;
  select evidence_hash into v_prev from public.share_events where enterprise_id=e.enterprise_id and status='approved' order by decided_at desc, seq desc limit 1;
  update public.share_events set status='approved', decided_by=auth.uid(), decided_at=now(), prev_hash=coalesce(v_prev,'GENESIS'),
    book_entry_id = coalesce(e.book_entry_id, 'BE-' || upper(substr(replace(e.id::text,'-',''),1,12))),
    evidence_hash = encode(sha256(convert_to(concat_ws('|', e.id, e.enterprise_id, e.class_id, e.event_type, e.from_holder, e.to_holder, e.quantity, coalesce(v_prev,'GENESIS')), 'UTF8')),'hex')
  where id=_event;
end $$;

create or replace function public.get_cap_table(_ent uuid)
returns table(shareholder_id uuid, shareholder_name text, class_id uuid, class_name text, quantity bigint)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, c.id, c.name, public.holder_balance(s.id, c.id)
  from public.shareholders s join public.share_classes c on c.enterprise_id = s.enterprise_id
  where s.enterprise_id = _ent and (public.can_view_ent(_ent) or s.user_id = auth.uid())
    and public.holder_balance(s.id, c.id) <> 0
$$;
create or replace function public.my_holdings()
returns table(enterprise_id uuid, legal_name text, shareholder_id uuid, class_id uuid, class_name text, quantity bigint)
language sql stable security definer set search_path = public as $$
  select e.id, e.legal_name, s.id, c.id, c.name, public.holder_balance(s.id, c.id)
  from public.shareholders s join public.enterprises e on e.id=s.enterprise_id join public.share_classes c on c.enterprise_id=e.id
  where s.user_id = auth.uid() and public.holder_balance(s.id, c.id) <> 0
$$;

-- Documents signing
create or replace function public.sign_document(_doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.enterprise_documents;
begin
  select * into d from public.enterprise_documents where id=_doc;
  if d.id is null then raise exception 'Not found'; end if;
  if not (public.is_member(auth.uid(), d.enterprise_id) or public.has_role(auth.uid(),'registrar') or public.has_role(auth.uid(),'founding_admin')) then raise exception 'Not authorized to sign'; end if;
  if d.status = 'signed' then raise exception 'Already signed'; end if;
  update public.enterprise_documents set status='signed', signed_by=auth.uid(), signed_at=now() where id=_doc;
end $$;

-- Market (SANDBOX ONLY)
create table public.offerings (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id) on delete cascade,
  class_id uuid not null references public.share_classes(id),
  title text not null,
  offering_type text not null default 'primary' check (offering_type in ('primary')),
  price numeric(20,6) not null check (price > 0),
  currency text not null default 'USD',
  quantity bigint not null check (quantity > 0),
  status text not null default 'draft' check (status in ('draft','open','closed','cancelled')),
  sandbox boolean not null default true check (sandbox = true),
  risk_summary text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.offerings to authenticated;
grant all on public.offerings to service_role;
alter table public.offerings enable row level security;
create policy "off view" on public.offerings for select to authenticated using (public.can_view_ent(enterprise_id) or status = 'open');
create policy "off insert" on public.offerings for insert to authenticated with check (public.can_manage_ent(enterprise_id));
create policy "off update" on public.offerings for update to authenticated using (public.can_manage_ent(enterprise_id) or public.has_role(auth.uid(),'compliance_officer'));

create table public.market_status (
  class_id uuid primary key references public.share_classes(id) on delete cascade,
  enterprise_id uuid not null references public.enterprises(id) on delete cascade,
  halted boolean not null default false,
  halt_reason text,
  liquidity_status text not null default 'illiquid',
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.market_status to authenticated;
grant all on public.market_status to service_role;
alter table public.market_status enable row level security;
create policy "ms view" on public.market_status for select to authenticated using (true);
create policy "ms write" on public.market_status for all to authenticated using (public.has_role(auth.uid(),'compliance_officer') or public.has_role(auth.uid(),'founding_admin')) with check (public.has_role(auth.uid(),'compliance_officer') or public.has_role(auth.uid(),'founding_admin'));

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id),
  class_id uuid not null references public.share_classes(id),
  user_id uuid not null,
  side text not null check (side in ('buy','sell')),
  price numeric(20,6) not null check (price > 0),
  quantity bigint not null check (quantity > 0),
  filled bigint not null default 0,
  status text not null default 'open' check (status in ('open','partial','filled','cancelled')),
  sandbox boolean not null default true check (sandbox = true),
  created_at timestamptz not null default now()
);
grant select on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "orders view" on public.orders for select to authenticated using (true);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id),
  class_id uuid not null references public.share_classes(id),
  buy_order uuid not null references public.orders(id),
  sell_order uuid not null references public.orders(id),
  price numeric(20,6) not null,
  quantity bigint not null,
  sandbox boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.trades to authenticated;
grant all on public.trades to service_role;
alter table public.trades enable row level security;
create policy "trades view" on public.trades for select to authenticated using (true);

create table public.surveillance_alerts (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid references public.enterprises(id),
  class_id uuid,
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  kind text not null,
  message text not null,
  status text not null default 'open' check (status in ('open','investigating','resolved','dismissed')),
  resolution text,
  created_at timestamptz not null default now()
);
grant select, update on public.surveillance_alerts to authenticated;
grant all on public.surveillance_alerts to service_role;
alter table public.surveillance_alerts enable row level security;
create policy "alerts view" on public.surveillance_alerts for select to authenticated using (public.is_staff(auth.uid()));
create policy "alerts update" on public.surveillance_alerts for update to authenticated using (public.has_role(auth.uid(),'compliance_officer') or public.has_role(auth.uid(),'founding_admin'));

create or replace function public.place_order(_class uuid, _side text, _price numeric, _qty bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ent uuid; v_id uuid; o record; v_rem bigint; v_fill bigint; v_last numeric; v_halt boolean;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not public.has_role(auth.uid(),'investor') then raise exception 'Investor eligibility required'; end if;
  if _side not in ('buy','sell') or _price <= 0 or _qty <= 0 then raise exception 'Invalid order'; end if;
  select c.enterprise_id into v_ent from public.share_classes c join public.enterprises e on e.id=c.enterprise_id where c.id=_class and e.status='active';
  if v_ent is null then raise exception 'Class not tradable (enterprise not active)'; end if;
  select halted into v_halt from public.market_status where class_id=_class;
  if coalesce(v_halt,false) then raise exception 'Market halted for this class'; end if;
  select price into v_last from public.trades where class_id=_class order by created_at desc limit 1;
  insert into public.orders(enterprise_id,class_id,user_id,side,price,quantity) values (v_ent,_class,auth.uid(),_side,_price,_qty) returning id into v_id;
  v_rem := _qty;
  for o in select * from public.orders where class_id=_class and status in ('open','partial') and side <> _side and id <> v_id
      and ((_side='buy' and price <= _price) or (_side='sell' and price >= _price))
      order by case when _side='buy' then price end asc, case when _side='sell' then price end desc, created_at asc for update loop
    exit when v_rem = 0;
    v_fill := least(v_rem, o.quantity - o.filled);
    insert into public.trades(enterprise_id,class_id,buy_order,sell_order,price,quantity)
      values (v_ent,_class, case when _side='buy' then v_id else o.id end, case when _side='sell' then v_id else o.id end, o.price, v_fill);
    update public.orders set filled = filled + v_fill, status = case when filled + v_fill = quantity then 'filled' else 'partial' end where id=o.id;
    v_rem := v_rem - v_fill;
    if v_last is not null and abs(o.price - v_last) / v_last > 0.2 then
      insert into public.surveillance_alerts(enterprise_id,class_id,severity,kind,message)
      values (v_ent,_class,'high','price_deviation', format('Sandbox trade at %s deviates >20%% from last price %s', o.price, v_last));
    end if;
  end loop;
  update public.orders set filled = _qty - v_rem, status = case when v_rem = 0 then 'filled' when v_rem < _qty then 'partial' else 'open' end where id=v_id;
  insert into public.market_status(class_id,enterprise_id,liquidity_status) values (_class,v_ent,'sandbox_active')
    on conflict (class_id) do update set liquidity_status='sandbox_active', updated_at=now();
  return v_id;
end $$;
create or replace function public.cancel_order(_order uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status='cancelled' where id=_order and user_id=auth.uid() and status in ('open','partial');
  if not found then raise exception 'Order not cancellable'; end if;
end $$;

-- Ledger (double-entry, multi-currency)
create table public.currencies (code text primary key, name text not null, is_internal boolean not null default false);
grant select on public.currencies to authenticated, anon;
grant all on public.currencies to service_role;
alter table public.currencies enable row level security;
create policy "cur read" on public.currencies for select using (true);
insert into public.currencies values ('LND','Loc Nation Dollar (internal accounting unit)',true),('USD','US Dollar',false),('EUR','Euro',false),('GBP','Pound Sterling',false),('CAD','Canadian Dollar',false),('NGN','Nigerian Naira',false),('JMD','Jamaican Dollar',false),('XOF','West African CFA Franc',false),('XCD','East Caribbean Dollar',false);

create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','revenue','expense')),
  currency text not null references public.currencies(code),
  created_at timestamptz not null default now(),
  unique (enterprise_id, code, currency)
);
grant select, insert on public.ledger_accounts to authenticated;
grant all on public.ledger_accounts to service_role;
alter table public.ledger_accounts enable row level security;
create policy "la view" on public.ledger_accounts for select to authenticated using (public.can_view_ent(enterprise_id));
create policy "la insert" on public.ledger_accounts for insert to authenticated with check (public.has_role(auth.uid(),'financial_ops') or public.has_role(auth.uid(),'founding_admin'));

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id),
  idempotency_key text not null unique,
  memo text not null,
  std_instruction_id uuid,
  is_demo boolean not null default false,
  posted_by uuid,
  posted_at timestamptz not null default now()
);
create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id),
  account_id uuid not null references public.ledger_accounts(id),
  debit numeric(24,6) not null default 0 check (debit >= 0),
  credit numeric(24,6) not null default 0 check (credit >= 0),
  currency text not null,
  check ((debit = 0) <> (credit = 0))
);
grant select on public.journal_entries, public.journal_lines to authenticated;
grant all on public.journal_entries, public.journal_lines to service_role;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
create policy "je view" on public.journal_entries for select to authenticated using (public.can_view_ent(enterprise_id));
create policy "jl view" on public.journal_lines for select to authenticated using (exists (select 1 from public.journal_entries j where j.id=entry_id and public.can_view_ent(j.enterprise_id)));
create or replace function public.immutable_trg() returns trigger language plpgsql as $$ begin raise exception '% is append-only', tg_table_name; end $$;
create trigger je_immutable before update or delete on public.journal_entries for each row execute function public.immutable_trg();
create trigger jl_immutable before update or delete on public.journal_lines for each row execute function public.immutable_trg();
create trigger audit_immutable before update or delete on public.audit_log for each row execute function public.immutable_trg();

create or replace function public.post_journal(_ent uuid, _key text, _memo text, _lines jsonb, _std uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; l jsonb; v_cur text; v_acc public.ledger_accounts; bad text;
begin
  if not (public.has_role(auth.uid(),'financial_ops') or public.has_role(auth.uid(),'founding_admin')) then raise exception 'Financial operations role required'; end if;
  select id into v_id from public.journal_entries where idempotency_key=_key;
  if v_id is not null then return v_id; end if;
  if jsonb_array_length(_lines) < 2 then raise exception 'At least two lines required'; end if;
  insert into public.journal_entries(enterprise_id,idempotency_key,memo,std_instruction_id,posted_by) values (_ent,_key,_memo,_std,auth.uid()) returning id into v_id;
  for l in select * from jsonb_array_elements(_lines) loop
    select * into v_acc from public.ledger_accounts where id=(l->>'account_id')::uuid;
    if v_acc.id is null or v_acc.enterprise_id <> _ent then raise exception 'Account not in enterprise'; end if;
    insert into public.journal_lines(entry_id,account_id,debit,credit,currency)
    values (v_id, v_acc.id, coalesce((l->>'debit')::numeric,0), coalesce((l->>'credit')::numeric,0), v_acc.currency);
  end loop;
  select string_agg(currency, ',') into bad from (select currency from public.journal_lines where entry_id=v_id group by currency having sum(debit) <> sum(credit)) x;
  if bad is not null then raise exception 'Unbalanced entry for currency %', bad; end if;
  return v_id;
end $$;

create or replace function public.account_balances(_ent uuid)
returns table(account_id uuid, code text, name text, account_type text, currency text, debits numeric, credits numeric, balance numeric)
language sql stable security definer set search_path = public as $$
  select a.id, a.code, a.name, a.account_type, a.currency, coalesce(sum(l.debit),0), coalesce(sum(l.credit),0), coalesce(sum(l.debit),0)-coalesce(sum(l.credit),0)
  from public.ledger_accounts a left join public.journal_lines l on l.account_id=a.id
  where a.enterprise_id=_ent and public.can_view_ent(_ent) group by a.id order by a.currency, a.code
$$;

-- FX quotes
create table public.fx_quotes (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null references public.currencies(code),
  quote_currency text not null references public.currencies(code),
  rate numeric(24,10) not null check (rate > 0),
  spread_bps numeric(10,2) not null default 0 check (spread_bps >= 0),
  fee numeric(20,6) not null default 0 check (fee >= 0),
  source text not null check (char_length(source) >= 2),
  quote_kind text not null check (quote_kind in ('internal_valuation','external_executable','test_mock')),
  is_executable boolean not null default false,
  quoted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by uuid,
  check (base_currency <> quote_currency),
  check (not (quote_kind <> 'external_executable' and is_executable))
);
grant select, insert on public.fx_quotes to authenticated;
grant all on public.fx_quotes to service_role;
alter table public.fx_quotes enable row level security;
create policy "fx view" on public.fx_quotes for select to authenticated using (true);
create policy "fx insert" on public.fx_quotes for insert to authenticated with check ((public.has_role(auth.uid(),'financial_ops') or public.has_role(auth.uid(),'founding_admin')) and quote_kind <> 'external_executable');

-- Integration configs
create table public.integration_configs (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  category text not null,
  mode text not null default 'test' check (mode in ('disabled','test','live')),
  base_url text,
  verified boolean not null default false,
  verified_at timestamptz,
  notes text,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.integration_configs to authenticated;
grant all on public.integration_configs to service_role;
alter table public.integration_configs enable row level security;
create policy "ic view" on public.integration_configs for select to authenticated using (public.is_staff(auth.uid()));
create policy "ic write" on public.integration_configs for all to authenticated using (public.has_role(auth.uid(),'founding_admin')) with check (public.has_role(auth.uid(),'founding_admin') and (mode <> 'live' or verified));
insert into public.integration_configs(provider,category,mode,base_url,notes) values
 ('global_soln_reserve','performance_reporting','test','https://globalsolnreserve.com','Not connected. No credentials configured; mock adapter in test mode.'),
 ('soln_central_bank','settlement','test',null,'SOLN Central Bank designated architecture. Protocol pending definition.'),
 ('gfi_routing','routing','test',null,'GFI = SOLN-configurable terminology pending exact protocol definition.'),
 ('broker_ats_partner','trading','disabled',null,'No broker-dealer/ATS partner configured. All trading is sandbox.'),
 ('transfer_agent','registry','disabled',null,'No registered transfer agent configured.'),
 ('custody_partner','custody','disabled',null,'No custody of real client funds.'),
 ('fx_liquidity_provider','fx','test',null,'No executable FX provider. Test quotes are non-executable.');

-- STD settlement instructions
create table public.std_instructions (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id),
  idempotency_key text not null unique,
  amount numeric(24,6) not null check (amount > 0),
  currency text not null references public.currencies(code),
  target_currency text references public.currencies(code),
  fx_quote_id uuid references public.fx_quotes(id),
  beneficiary text not null,
  purpose text,
  state text not null default 'CREATED',
  external_ref text,
  adapter text not null default 'mock_test',
  is_test boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.std_transitions (
  id bigserial primary key,
  instruction_id uuid not null references public.std_instructions(id),
  from_state text, to_state text not null, external_ref text, note text, actor uuid, created_at timestamptz not null default now()
);
grant select on public.std_instructions, public.std_transitions to authenticated;
grant all on public.std_instructions, public.std_transitions to service_role;
grant usage on sequence public.std_transitions_id_seq to service_role;
alter table public.std_instructions enable row level security;
alter table public.std_transitions enable row level security;
create policy "std view" on public.std_instructions for select to authenticated using (public.can_view_ent(enterprise_id));
create policy "stdt view" on public.std_transitions for select to authenticated using (exists (select 1 from public.std_instructions s where s.id=instruction_id and public.can_view_ent(s.enterprise_id)));
create trigger stdt_immutable before update or delete on public.std_transitions for each row execute function public.immutable_trg();

create or replace function public.std_allowed(_from text, _to text) returns boolean language sql immutable as $$
  select (_from, _to) in (
    ('CREATED','VALIDATED'),('VALIDATED','QUOTED'),('QUOTED','FUNDED'),('FUNDED','EXECUTED'),('EXECUTED','SETTLED'),('SETTLED','RECONCILED'),('RECONCILED','ARCHIVED'),
    ('CREATED','CANCELLED'),('VALIDATED','CANCELLED'),('QUOTED','CANCELLED'),('QUOTED','EXPIRED'),
    ('CREATED','FAILED'),('VALIDATED','FAILED'),('QUOTED','FAILED'),('FUNDED','FAILED'),('EXECUTED','FAILED'),
    ('FUNDED','REVERSED'),('EXECUTED','REVERSED'),('SETTLED','REVERSED'),
    ('EXECUTED','DISPUTED'),('SETTLED','DISPUTED'),('RECONCILED','DISPUTED'),('DISPUTED','REVERSED'),('DISPUTED','SETTLED'))
$$;

create or replace function public.create_std(_ent uuid, _key text, _amount numeric, _currency text, _target text, _beneficiary text, _purpose text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (public.has_role(auth.uid(),'financial_ops') or public.has_role(auth.uid(),'founding_admin')) then raise exception 'Financial operations role required'; end if;
  select id into v_id from public.std_instructions where idempotency_key=_key;
  if v_id is not null then return v_id; end if;
  insert into public.std_instructions(enterprise_id,idempotency_key,amount,currency,target_currency,beneficiary,purpose,created_by)
  values (_ent,_key,_amount,_currency,nullif(_target,''),_beneficiary,_purpose,auth.uid()) returning id into v_id;
  insert into public.std_transitions(instruction_id,from_state,to_state,actor,note) values (v_id,null,'CREATED',auth.uid(),'Instruction created (test mode)');
  return v_id;
end $$;

create or replace function public.transition_std(_id uuid, _to text, _external_ref text default null, _note text default null, _quote uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.std_instructions; q public.fx_quotes; v_mode text; v_verified boolean;
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
    select mode, verified into v_mode, v_verified from public.integration_configs where provider='soln_central_bank';
    if s.is_test then
      if _external_ref not like 'MOCK-%' then raise exception 'Test-mode instructions accept only MOCK- confirmations from the mock adapter'; end if;
    elsif not (v_mode='live' and v_verified) then raise exception 'No verified live settlement integration configured';
    end if;
  end if;
  update public.std_instructions set state=_to, external_ref=coalesce(_external_ref, external_ref), fx_quote_id=coalesce(_quote, fx_quote_id), updated_at=now() where id=_id;
  insert into public.std_transitions(instruction_id,from_state,to_state,external_ref,note,actor) values (_id,s.state,_to,_external_ref,_note,auth.uid());
end $$;

-- Performance (Global SOLN Reserve profiles)
create table public.performance_profiles (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id) on delete cascade,
  visibility text not null check (visibility in ('private','public')),
  gsr_sync_status text not null default 'not_connected',
  created_at timestamptz not null default now(),
  unique (enterprise_id, visibility)
);
create table public.performance_records (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id) on delete cascade,
  period text not null,
  metric text not null check (metric in ('revenue','loss','profit','milestone','jobs','default','insolvency','compliance_finding','dividend','share_change')),
  value numeric(24,6),
  currency text references public.currencies(code),
  narrative text,
  verification text not null default 'enterprise_reported' check (verification in ('enterprise_reported','verified')),
  visibility text not null default 'private' check (visibility in ('private','investor','public_approved')),
  corrects_id uuid references public.performance_records(id),
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select on public.performance_profiles to authenticated;
grant all on public.performance_profiles to service_role;
grant select, insert, update on public.performance_records to authenticated;
grant all on public.performance_records to service_role;
alter table public.performance_profiles enable row level security;
alter table public.performance_records enable row level security;
create policy "pp view" on public.performance_profiles for select to authenticated using (public.can_view_ent(enterprise_id) or visibility='public');
create policy "pr view" on public.performance_records for select to authenticated using (
  public.can_view_ent(enterprise_id) or visibility='public_approved'
  or (visibility='investor' and exists (select 1 from public.shareholders s where s.user_id=auth.uid() and s.enterprise_id=performance_records.enterprise_id)));
create policy "pr insert" on public.performance_records for insert to authenticated with check (public.can_manage_ent(enterprise_id) and verification='enterprise_reported' and visibility <> 'public_approved');
create policy "pr update staff" on public.performance_records for update to authenticated using (public.has_role(auth.uid(),'compliance_officer') or public.has_role(auth.uid(),'founding_admin'));

-- Disclosures
create table public.disclosures (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id) on delete cascade,
  title text not null,
  category text not null default 'general' check (category in ('general','risk','financial','corporate_action','dividend_notice','material_event')),
  body text not null,
  risk_level text check (risk_level in ('low','medium','high')),
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.disclosures to authenticated;
grant all on public.disclosures to service_role;
alter table public.disclosures enable row level security;
create policy "disc view" on public.disclosures for select to authenticated using (public.can_view_ent(enterprise_id) or status='approved');
create policy "disc insert" on public.disclosures for insert to authenticated with check (public.can_manage_ent(enterprise_id) and status in ('draft','submitted'));
create policy "disc update" on public.disclosures for update to authenticated using (
  (public.can_manage_ent(enterprise_id) and status in ('draft','rejected')) or public.has_role(auth.uid(),'compliance_officer') or public.has_role(auth.uid(),'founding_admin'))
  with check (status <> 'approved' or public.has_role(auth.uid(),'compliance_officer') or public.has_role(auth.uid(),'founding_admin'));

-- Compliance calendar
create table public.compliance_items (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id) on delete cascade,
  title text not null,
  due_date date not null,
  status text not null default 'open' check (status in ('open','submitted','accepted','overdue_flagged','waived')),
  finding text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.compliance_items to authenticated;
grant all on public.compliance_items to service_role;
alter table public.compliance_items enable row level security;
create policy "ci view" on public.compliance_items for select to authenticated using (public.can_view_ent(enterprise_id));
create policy "ci write" on public.compliance_items for insert to authenticated with check (public.can_manage_ent(enterprise_id) or public.has_role(auth.uid(),'compliance_officer'));
create policy "ci update" on public.compliance_items for update to authenticated using (public.can_manage_ent(enterprise_id) or public.has_role(auth.uid(),'compliance_officer'));

-- Investor requests (complaints, secondary transfer requests)
create table public.investor_requests (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprises(id),
  user_id uuid not null,
  kind text not null check (kind in ('complaint','secondary_transfer','information')),
  subject text not null check (char_length(subject) between 3 and 200),
  body text not null check (char_length(body) between 3 and 5000),
  status text not null default 'open' check (status in ('open','in_review','resolved','rejected')),
  response text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.investor_requests to authenticated;
grant all on public.investor_requests to service_role;
alter table public.investor_requests enable row level security;
create policy "ir view" on public.investor_requests for select to authenticated using (user_id=auth.uid() or public.can_view_ent(enterprise_id));
create policy "ir insert" on public.investor_requests for insert to authenticated with check (user_id=auth.uid() and status='open');
create policy "ir update" on public.investor_requests for update to authenticated using (public.has_role(auth.uid(),'compliance_officer') or public.has_role(auth.uid(),'registrar') or public.has_role(auth.uid(),'founding_admin'));

-- Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  enterprise_id uuid,
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "notif own" on public.notifications for select to authenticated using (user_id=auth.uid());
create policy "notif read" on public.notifications for update to authenticated using (user_id=auth.uid());

-- Provisioning orchestration
create or replace function public.run_provision_module(_ent uuid, _module text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.enterprises; c text; v_founder uuid;
begin
  select * into e from public.enterprises where id=_ent;
  update public.provisioning_tasks set status='running', attempts=attempts+1, updated_at=now() where enterprise_id=_ent and module=_module;
  begin
    if _module = 'enterprise_id' then
      update public.enterprises set enterprise_code = coalesce(enterprise_code, 'BSEC-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(id::text,'-',''),1,6))) where id=_ent;
    elsif _module = 'dashboard' then null;
    elsif _module = 'governance_documents' then
      if not exists (select 1 from public.enterprise_documents where enterprise_id=_ent and doc_type='membership_agreement') then
        insert into public.enterprise_documents(enterprise_id,title,doc_type,content,status,created_by) values
        (_ent,'Black SEC Registry Membership Agreement (DRAFT)','membership_agreement', format('DRAFT. %s accepts binding Black SEC standards BSEC-001 to BSEC-030 under SOLN GPBC governance. Registry membership is not exchange or government registration.', e.legal_name),'pending_signature',e.created_by),
        (_ent,'Board Authorization Resolution for Share Issuance (DRAFT)','authorization_resolution', format('DRAFT. Resolved that %s authorizes the capitalization classes recorded in the Black SEC Shares Archive. Shares are not issued until recorded events are approved by the registrar.', e.legal_name),'pending_signature',e.created_by),
        (_ent,'Bylaws / Operating Agreement (DRAFT)','bylaws','DRAFT template. To be completed by counsel.','draft',e.created_by);
      end if;
    elsif _module = 'cap_table' then
      if not exists (select 1 from public.share_classes where enterprise_id=_ent) then raise exception 'No capitalization classes defined'; end if;
    elsif _module = 'shares_archive' then null;
    elsif _module = 'multi_currency_accounts' then
      foreach c in array e.ledger_currencies loop
        insert into public.ledger_accounts(enterprise_id,code,name,account_type,currency) values
          (_ent,'1000','Operating Cash (internal, zero-balance)','asset',c),
          (_ent,'2000','Settlement Clearing','liability',c),
          (_ent,'3000','Paid-in Capital','equity',c)
        on conflict do nothing;
      end loop;
    elsif _module = 'disclosure_workspace' then
      if not exists (select 1 from public.disclosures where enterprise_id=_ent) then
        insert into public.disclosures(enterprise_id,title,category,body,risk_level) values (_ent,'Risk Factors (DRAFT)','risk','DRAFT. Enterprise to describe material risks.','high');
      end if;
    elsif _module = 'performance_profile' then
      insert into public.performance_profiles(enterprise_id,visibility) values (_ent,'private'),(_ent,'public') on conflict do nothing;
    elsif _module = 'compliance_calendar' then
      if not exists (select 1 from public.compliance_items where enterprise_id=_ent) then
        insert into public.compliance_items(enterprise_id,title,due_date) values
          (_ent,'Quarterly performance report', (current_date + 90)),
          (_ent,'Annual beneficial ownership re-certification', (current_date + 365)),
          (_ent,'Sign governance documents', (current_date + 14));
      end if;
    elsif _module = 'reporting' then null;
    elsif _module = 'notifications' then
      for v_founder in select user_id from public.enterprise_members where enterprise_id=_ent loop
        insert into public.notifications(user_id,enterprise_id,title,body) values (v_founder,_ent,'Enterprise provisioned','Review provisioning status and sign pending governance documents.');
      end loop;
    end if;
    update public.provisioning_tasks set status='completed', last_error=null, updated_at=now() where enterprise_id=_ent and module=_module;
  exception when others then
    update public.provisioning_tasks set status='failed', last_error=sqlerrm, updated_at=now() where enterprise_id=_ent and module=_module;
  end;
end $$;

create or replace function public.provision_enterprise(_ent uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m text;
begin
  if not public.can_manage_ent(_ent) then raise exception 'Not authorized'; end if;
  foreach m in array array['enterprise_id','dashboard','governance_documents','cap_table','shares_archive','multi_currency_accounts','disclosure_workspace','performance_profile','compliance_calendar','reporting','notifications'] loop
    insert into public.provisioning_tasks(enterprise_id,module) values (_ent,m) on conflict do nothing;
    if (select status from public.provisioning_tasks where enterprise_id=_ent and module=m) <> 'completed' then
      perform public.run_provision_module(_ent, m);
    end if;
  end loop;
  update public.enterprises set status = case when exists (select 1 from public.provisioning_tasks where enterprise_id=_ent and status='failed') then 'provisioning' else 'pending_review' end,
    registry_membership_status = 'pending' where id=_ent and status in ('draft','provisioning');
end $$;

create or replace function public.submit_onboarding(_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ent uuid; x jsonb; v_cls uuid; v_sh uuid; v_cls_map jsonb := '{}'; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if coalesce((_payload->>'membership_accepted')::boolean,false) is not true then raise exception 'Binding Black SEC standards must be accepted'; end if;
  if coalesce(jsonb_array_length(_payload->'classes'),0) = 0 then raise exception 'At least one capitalization class required'; end if;
  insert into public.enterprises(legal_name,trade_name,entity_type,jurisdiction,registration_number,address,membership_accepted,membership_accepted_at,standards_version,equity_mode,ledger_currencies,public_summary,created_by,status)
  values (_payload->>'legal_name', nullif(_payload->>'trade_name',''), _payload->>'entity_type', _payload->>'jurisdiction', nullif(_payload->>'registration_number',''), nullif(_payload->>'address',''),
    true, now(), 'BSEC-001..030 / PRD-BSEC-2026-001', _payload->>'equity_mode',
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(_payload->'currencies')), '{LND,USD}'), nullif(_payload->>'public_summary',''), v_uid, 'draft')
  returning id into v_ent;
  insert into public.enterprise_members(enterprise_id,user_id,role) values (v_ent,v_uid,'founder');
  for x in select * from jsonb_array_elements(coalesce(_payload->'owners','[]')) loop
    insert into public.beneficial_owners(enterprise_id,full_name,ownership_pct,control_role) values (v_ent, x->>'full_name', (x->>'ownership_pct')::numeric, x->>'control_role');
  end loop;
  for x in select * from jsonb_array_elements(coalesce(_payload->'documents','[]')) loop
    insert into public.enterprise_documents(enterprise_id,title,doc_type,content,created_by) values (v_ent, x->>'title', coalesce(x->>'doc_type','supporting'), coalesce(x->>'content',''), v_uid);
  end loop;
  for x in select * from jsonb_array_elements(_payload->'classes') loop
    insert into public.share_classes(enterprise_id,name,authorized,par_value,voting_rights,dividend_rights,transfer_restrictions)
    values (v_ent, x->>'name', (x->>'authorized')::bigint, coalesce((x->>'par_value')::numeric,0), coalesce(x->>'voting_rights','one_vote_per_share'), x->>'dividend_rights', x->>'transfer_restrictions') returning id into v_cls;
    v_cls_map := v_cls_map || jsonb_build_object(x->>'name', v_cls);
  end loop;
  for x in select * from jsonb_array_elements(coalesce(_payload->'shareholders','[]')) loop
    insert into public.shareholders(enterprise_id,name,email,holder_type) values (v_ent, x->>'name', nullif(x->>'email',''), coalesce(x->>'holder_type','individual')) returning id into v_sh;
    if coalesce((x->>'quantity')::bigint,0) > 0 and v_cls_map ? (x->>'class_name') then
      insert into public.share_events(enterprise_id,class_id,event_type,to_holder,quantity,notes,proposed_by)
      values (v_ent, (v_cls_map->>(x->>'class_name'))::uuid, 'issuance', v_sh, (x->>'quantity')::bigint,
        case when _payload->>'equity_mode'='import' then 'Imported existing holding (pending registrar verification)' else 'Initial issuance (proposed, not issued)' end, v_uid);
    end if;
  end loop;
  perform public.provision_enterprise(v_ent);
  return v_ent;
end $$;

create or replace function public.retry_provisioning(_task uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.provisioning_tasks;
begin
  select * into t from public.provisioning_tasks where id=_task;
  if not public.can_manage_ent(t.enterprise_id) then raise exception 'Not authorized'; end if;
  perform public.provision_enterprise(t.enterprise_id);
end $$;

create or replace function public.decide_enterprise(_ent uuid, _approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(),'registrar') or public.has_role(auth.uid(),'founding_admin')) then raise exception 'Registrar required'; end if;
  update public.enterprises set status = case when _approve then 'active' else 'rejected' end,
    registry_membership_status = case when _approve then 'member' else 'not_member' end where id=_ent and status='pending_review';
  if not found then raise exception 'Enterprise not pending review'; end if;
  insert into public.notifications(user_id,enterprise_id,title,body) select user_id,_ent, case when _approve then 'Registry membership approved' else 'Registry membership rejected' end, 'Registry membership is not exchange or government registration.' from public.enterprise_members where enterprise_id=_ent;
end $$;

create or replace function public.set_user_role(_user uuid, _role public.app_role, _grant boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'founding_admin') then raise exception 'Founding administrator required'; end if;
  if _grant then insert into public.user_roles(user_id,role) values (_user,_role) on conflict do nothing;
  else
    if _role='founding_admin' and _user=auth.uid() then raise exception 'Cannot remove your own founding admin role'; end if;
    delete from public.user_roles where user_id=_user and role=_role;
  end if;
  insert into public.audit_log(actor,action,entity,entity_id,details) values (auth.uid(), case when _grant then 'GRANT_ROLE' else 'REVOKE_ROLE' end,'user_roles',_user::text, jsonb_build_object('role',_role));
end $$;

-- Public directory (safe columns only)
create or replace function public.public_enterprise_directory()
returns table(id uuid, enterprise_code text, legal_name text, entity_type text, jurisdiction text, registry_membership_status text, exchange_registration_status text, public_summary text, is_demo boolean)
language sql stable security definer set search_path = public as $$
  select id, enterprise_code, legal_name, entity_type, jurisdiction, registry_membership_status, exchange_registration_status, public_summary, is_demo
  from public.enterprises where status='active' or is_template
$$;
grant execute on function public.public_enterprise_directory() to anon, authenticated;

-- Signup trigger: founding governance first
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name, email) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)), new.email);
  insert into public.user_roles(user_id, role) values (new.id, 'investor');
  if not exists (select 1 from public.user_roles where role='founding_admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'founding_admin'), (new.id,'registrar'), (new.id,'compliance_officer'), (new.id,'financial_ops');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Audit triggers
create trigger a_ent after insert or update or delete on public.enterprises for each row execute function public.audit_trg();
create trigger a_docs after insert or update on public.enterprise_documents for each row execute function public.audit_trg();
create trigger a_cls after insert or update on public.share_classes for each row execute function public.audit_trg();
create trigger a_sh after insert or update on public.shareholders for each row execute function public.audit_trg();
create trigger a_se after insert or update on public.share_events for each row execute function public.audit_trg();
create trigger a_off after insert or update on public.offerings for each row execute function public.audit_trg();
create trigger a_ord after insert or update on public.orders for each row execute function public.audit_trg();
create trigger a_ms after insert or update on public.market_status for each row execute function public.audit_trg();
create trigger a_je after insert on public.journal_entries for each row execute function public.audit_trg();
create trigger a_std after insert or update on public.std_instructions for each row execute function public.audit_trg();
create trigger a_fx after insert on public.fx_quotes for each row execute function public.audit_trg();
create trigger a_pr after insert or update on public.performance_records for each row execute function public.audit_trg();
create trigger a_disc after insert or update on public.disclosures for each row execute function public.audit_trg();
create trigger a_ic after insert or update on public.integration_configs for each row execute function public.audit_trg();
create trigger a_alert after update on public.surveillance_alerts for each row execute function public.audit_trg();
create trigger a_ir after insert or update on public.investor_requests for each row execute function public.audit_trg();

-- Seed: SOLN GPBC founding template (no holdings, no tax data) + labeled DEMO enterprise
insert into public.enterprises(id,enterprise_code,legal_name,entity_type,jurisdiction,status,membership_accepted,registry_membership_status,public_summary,is_template)
values ('00000000-0000-4000-a000-000000000001','BSEC-FOUNDING-TEMPLATE','State of Loc Nation Global Public Benefit Corporation (SOLN GPBC) — Founding Template','public_benefit_corporation','To be confirmed by SOLN GPBC','draft',false,'not_member','Optional founding governance template. No holdings, capitalization or tax data recorded.',true);
insert into public.enterprises(id,enterprise_code,legal_name,entity_type,jurisdiction,status,membership_accepted,membership_accepted_at,registry_membership_status,public_summary,is_demo,ledger_currencies,equity_mode)
values ('00000000-0000-4000-a000-000000000002','BSEC-DEMO-0001','DEMO Harbor Provisions Cooperative Inc. (DEMO DATA)','corporation','DEMO Jurisdiction','active',true,now(),'member','DEMO DATA ONLY. Fictional enterprise for sandbox walkthroughs.',true,'{LND,USD,JMD}','new');
insert into public.share_classes(id,enterprise_id,name,authorized,par_value,voting_rights) values ('00000000-0000-4000-b000-000000000001','00000000-0000-4000-a000-000000000002','DEMO Common',1000000,0.01,'one_vote_per_share');
insert into public.shareholders(id,enterprise_id,name,is_demo) values ('00000000-0000-4000-c000-000000000001','00000000-0000-4000-a000-000000000002','DEMO Founder Holder',true),('00000000-0000-4000-c000-000000000002','00000000-0000-4000-a000-000000000002','DEMO Seed Holder',true);
insert into public.enterprise_documents(enterprise_id,title,doc_type,content,status,signed_at) values ('00000000-0000-4000-a000-000000000002','DEMO Authorization Resolution','authorization_resolution','DEMO DATA. Fictional resolution for sandbox.','signed',now());
insert into public.share_events(enterprise_id,class_id,event_type,to_holder,quantity,notes,status,prev_hash,evidence_hash,book_entry_id,decided_at)
values ('00000000-0000-4000-a000-000000000002','00000000-0000-4000-b000-000000000001','issuance','00000000-0000-4000-c000-000000000001',600000,'DEMO issuance','approved','GENESIS',encode(sha256(convert_to('DEMO-1|GENESIS','UTF8')),'hex'),'BE-DEMO-0001',now());
insert into public.share_events(enterprise_id,class_id,event_type,to_holder,quantity,notes,status,prev_hash,evidence_hash,book_entry_id,decided_at)
values ('00000000-0000-4000-a000-000000000002','00000000-0000-4000-b000-000000000001','issuance','00000000-0000-4000-c000-000000000002',150000,'DEMO issuance','approved',encode(sha256(convert_to('DEMO-1|GENESIS','UTF8')),'hex'),encode(sha256(convert_to('DEMO-2','UTF8')),'hex'),'BE-DEMO-0002',now() + interval '1 second');
insert into public.disclosures(enterprise_id,title,category,body,risk_level,status,approved_at) values
 ('00000000-0000-4000-a000-000000000002','DEMO Risk Factors','risk','DEMO DATA. Sandbox securities are not registered with any government regulator; no real trading occurs.','high','approved',now()),
 ('00000000-0000-4000-a000-000000000002','DEMO Dividend Notice','dividend_notice','DEMO DATA. No dividend declared.','low','approved',now());
insert into public.performance_profiles(enterprise_id,visibility) values ('00000000-0000-4000-a000-000000000002','private'),('00000000-0000-4000-a000-000000000002','public');
insert into public.performance_records(enterprise_id,period,metric,value,currency,narrative,verification,visibility) values
 ('00000000-0000-4000-a000-000000000002','DEMO 2026-Q3','revenue',125000,'USD','DEMO DATA — enterprise-reported, unverified.','enterprise_reported','public_approved'),
 ('00000000-0000-4000-a000-000000000002','DEMO 2026-Q3','jobs',14,null,'DEMO DATA','enterprise_reported','public_approved');
insert into public.market_status(class_id,enterprise_id,liquidity_status) values ('00000000-0000-4000-b000-000000000001','00000000-0000-4000-a000-000000000002','sandbox_active');
insert into public.ledger_accounts(enterprise_id,code,name,account_type,currency) values
 ('00000000-0000-4000-a000-000000000002','1000','Operating Cash (internal, zero-balance)','asset','USD'),
 ('00000000-0000-4000-a000-000000000002','2000','Settlement Clearing','liability','USD'),
 ('00000000-0000-4000-a000-000000000002','3000','Paid-in Capital','equity','USD');
insert into public.compliance_items(enterprise_id,title,due_date) values ('00000000-0000-4000-a000-000000000002','DEMO quarterly report', current_date + 30);
