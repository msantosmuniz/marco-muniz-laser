begin;
create extension if not exists btree_gist with schema extensions;

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slot smallint not null unique check (slot in (1, 2)),
  active boolean not null default true
);
alter table public.admins enable row level security;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admins where user_id = auth.uid() and active);
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
create policy admin_self on public.admins for select to authenticated using (user_id = auth.uid());
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

create table public.procedures (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  interval_days integer not null check (interval_days between 1 and 730),
  version uuid not null default gen_random_uuid()
);
insert into public.procedures(id, name, interval_days) values
('00000000-0000-4000-8000-000000000001', 'Remoção de tatuagem', 60),
('00000000-0000-4000-8000-000000000002', 'Remoção de micropigmentação', 30),
('00000000-0000-4000-8000-000000000003', 'Tratamento de onicomicose', 15);
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  phone text not null check (phone ~ '^[0-9]{10,13}$'),
  procedure_id uuid not null references public.procedures,
  created_at timestamptz not null default now(),
  version uuid not null default gen_random_uuid()
);
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients,
  content text not null check (length(trim(content)) between 1 and 4000),
  author_id uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now()
);
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients,
  procedure_id uuid not null references public.procedures,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 240),
  status text not null default 'agendado' check (status in ('agendado', 'cancelado', 'realizado')),
  price_cents integer not null default 0 check (price_cents between 0 and 100000000),
  created_at timestamptz not null default now(),
  version uuid not null default gen_random_uuid(),
  -- One shared treatment resource in v1. Half-open range allows adjacent sessions.
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
    where (status <> 'cancelado')
);
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients,
  procedure_id uuid not null references public.procedures,
  amount_cents integer not null check (amount_cents between 0 and 100000000),
  status text not null default 'novo' check (status in ('novo', 'orçamento enviado', 'fechado', 'sem resposta', 'perdido')),
  created_at timestamptz not null default now(),
  version uuid not null default gen_random_uuid()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique default gen_random_uuid(),
  appointment_id uuid not null references public.appointments,
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  paid_at timestamptz not null,
  method text not null check (method in ('pix', 'dinheiro', 'cartão', 'transferência')),
  created_at timestamptz not null default now()
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users on delete set null,
  action text not null,
  entity text not null,
  record_id uuid,
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index appointments_starts_at on public.appointments(starts_at);
create index appointments_patient on public.appointments(patient_id);
create index notes_patient on public.notes(patient_id);
create index quotes_patient on public.quotes(patient_id);
create index payments_appointment on public.payments(appointment_id);
create index payments_paid on public.payments(paid_at);
create index audit_created on public.audit_events(created_at desc);

create function public.set_session_end() returns trigger language plpgsql set search_path = '' as $$
begin new.ends_at = new.starts_at + new.duration_minutes * interval '1 minute'; return new; end;
$$;
create trigger set_session_end before insert or update on public.appointments for each row execute function public.set_session_end();

create function public.bump_version() returns trigger language plpgsql set search_path = '' as $$
begin new.version = gen_random_uuid(); return new; end;
$$;
create function public.audit_mutation() returns trigger language plpgsql security definer set search_path = '' as $$
declare fields text[];
begin
  if TG_OP = 'UPDATE' then
    select array_agg(key) into fields from jsonb_each(to_jsonb(new)) where value is distinct from to_jsonb(old)->key and key <> 'version';
  else fields = array[]::text[]; end if;
  insert into public.audit_events(actor_id, action, entity, record_id, changed_fields)
  values(auth.uid(), lower(TG_OP), TG_TABLE_NAME, new.id, coalesce(fields, '{}'));
  return new;
end;
$$;
-- No clinical text, passwords, tokens or phone numbers are copied into audit records.
create function public.log_activity(event_action text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if event_action not in ('login', 'logout', 'refresh', 'view_workspace') then raise exception 'Invalid event'; end if;
  insert into public.audit_events(actor_id, action, entity) values(auth.uid(), event_action, 'workspace');
end;
$$;
revoke all on function public.log_activity(text) from public;
grant execute on function public.log_activity(text) to authenticated;

-- Serialize receipts for each appointment: concurrent payments cannot overpay a session.
create function public.check_payment() returns trigger language plpgsql set search_path = '' as $$
declare session_row public.appointments; received bigint;
begin
  select * into session_row from public.appointments where id = new.appointment_id for update;
  if not found or session_row.status <> 'realizado' then raise exception 'Session must be completed'; end if;
  select coalesce(sum(amount_cents), 0) into received from public.payments where appointment_id = new.appointment_id;
  if received + new.amount_cents > session_row.price_cents then raise exception 'Payment exceeds balance'; end if;
  return new;
end;
$$;
create trigger check_payment before insert on public.payments for each row execute function public.check_payment();
create function public.protect_paid_session() returns trigger language plpgsql set search_path = '' as $$
declare received bigint;
begin
  select coalesce(sum(amount_cents), 0) into received from public.payments where appointment_id = old.id;
  if received > 0 and (new.status <> 'realizado' or new.price_cents < received or new.patient_id <> old.patient_id or new.procedure_id <> old.procedure_id or new.starts_at <> old.starts_at) then
    raise exception 'Paid session cannot be reassigned, moved, cancelled or reduced below receipts';
  end if;
  return new;
end;
$$;
create trigger protect_paid before update on public.appointments for each row execute function public.protect_paid_session();

do $$ declare t text; begin
  foreach t in array array['patients','procedures','notes','appointments','quotes','payments','audit_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy admin_read on public.%I for select to authenticated using (public.is_admin())', t);
    if t <> 'audit_events' then
      execute format('create trigger audit_change after insert or update on public.%I for each row execute function public.audit_mutation()', t);
    end if;
    if t in ('patients','appointments','quotes','procedures') then
      execute format('create trigger version_change before update on public.%I for each row execute function public.bump_version()', t);
      execute format('create policy admin_update on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    end if;
    if t in ('patients','appointments','quotes','notes','payments') then
      execute format('create policy admin_insert on public.%I for insert to authenticated with check (public.is_admin())', t);
    end if;
  end loop;
end $$;
-- Column privileges also protect against clients calling PostgREST directly.
grant insert (name,phone,procedure_id), update (name,phone,procedure_id) on public.patients to authenticated;
grant insert (patient_id,content) on public.notes to authenticated;
grant insert (patient_id,procedure_id,starts_at,duration_minutes,status,price_cents), update (patient_id,procedure_id,starts_at,duration_minutes,status,price_cents) on public.appointments to authenticated;
grant insert (patient_id,procedure_id,amount_cents,status), update (patient_id,procedure_id,amount_cents,status) on public.quotes to authenticated;
grant insert (appointment_id,amount_cents,paid_at,method,idempotency_key) on public.payments to authenticated;
grant update (interval_days) on public.procedures to authenticated;
revoke all on function public.audit_mutation(), public.bump_version(), public.check_payment(), public.protect_paid_session(), public.set_session_end() from public;
commit;
