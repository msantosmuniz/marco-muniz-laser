begin;
-- Additive migration: old amounts, statuses, dates and patient IDs are retained.
alter table public.quotes
  add column description text not null default '' check (length(description) <= 4000),
  add column session_price_cents integer check (session_price_cents between 0 and 100000000),
  add column quote_date date,
  add column intake_key uuid unique;
alter table public.quotes drop constraint quotes_status_check;
alter table public.quotes add constraint quotes_status_check check
  (status in ('novo', 'orçamento enviado', 'sem resposta', 'aguardando', 'fechado', 'perdido'));
-- NULL quote_date on legacy records means created_at in America/Sao_Paulo.
grant insert (description,session_price_cents,quote_date,intake_key),
  update (description,session_price_cents,quote_date) on public.quotes to authenticated;

create table public.quote_contacts (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes,
  stage smallint not null check (stage in (7,15)),
  actor_id uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  unique(quote_id,stage)
);
alter table public.quote_contacts enable row level security;
revoke all on public.quote_contacts from anon, authenticated;
grant select on public.quote_contacts to authenticated;
grant insert (quote_id,stage) on public.quote_contacts to authenticated;
create policy admin_read on public.quote_contacts for select to authenticated using (public.is_admin());
create policy admin_insert on public.quote_contacts for insert to authenticated with check (public.is_admin());
create function public.check_quote_contact() returns trigger language plpgsql set search_path = '' as $$
declare q public.quotes;
begin
  select * into q from public.quotes where id = new.quote_id for update;
  if not found or q.status in ('fechado','perdido') then raise exception 'Quote is closed'; end if;
  if (now() at time zone 'America/Sao_Paulo')::date - coalesce(q.quote_date,(q.created_at at time zone 'America/Sao_Paulo')::date) < new.stage
    then raise exception 'Follow-up is not due'; end if;
  return new;
end;
$$;
create trigger check_contact before insert on public.quote_contacts for each row execute function public.check_quote_contact();
create trigger audit_change after insert on public.quote_contacts for each row execute function public.audit_mutation();
revoke all on function public.check_quote_contact() from public;

create function public.normalized_phone(phone text) returns text language sql immutable set search_path = '' as $$
  select case when length(phone) in (10,11) then '55' || phone else phone end;
$$;
revoke all on function public.normalized_phone(text) from public;
grant execute on function public.normalized_phone(text) to authenticated;
create index patients_phone_match on public.patients(public.normalized_phone(phone));

-- Invoker privileges retain RLS. Patient + quote creation is one transaction.
-- Serialize phone-based intake, reuse exact matches, reject ambiguity; never merge people.
create function public.create_quote_intake(payload jsonb) returns public.quotes
language plpgsql security invoker set search_path = '' as $$
declare p_id uuid; q public.quotes; matches integer; candidate public.patients; normalized_number text; customer_name text; key uuid;
begin
  if not public.is_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  key := (payload->>'intake_key')::uuid;
  if key is null then raise exception 'Idempotency key required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(key::text,0));
  select * into q from public.quotes where intake_key = key;
  if found then return q; end if;
  if payload->>'session_price_cents' is null or payload->>'quote_date' is null then raise exception 'Quote fields required'; end if;
  p_id := (payload->>'patient_id')::uuid;
  if p_id is null then
    normalized_number := public.normalized_phone(payload->>'phone');
    customer_name := trim(payload->>'name');
    if normalized_number is null or normalized_number !~ '^[0-9]{12,13}$' or customer_name is null or length(customer_name) not between 2 and 120 then raise exception 'Invalid customer'; end if;
    perform pg_advisory_xact_lock(hashtextextended(normalized_number,1));
    select count(*) into matches from public.patients where public.normalized_phone(patients.phone) = normalized_number;
    if matches > 1 then raise exception 'Ambiguous phone; select an existing customer'; end if;
    if matches = 1 then
      select * into candidate from public.patients where public.normalized_phone(patients.phone) = normalized_number;
      if lower(regexp_replace(trim(candidate.name),'\s+',' ','g')) <> lower(regexp_replace(customer_name,'\s+',' ','g')) then
        raise exception 'Phone already registered; select an existing customer';
      end if;
      p_id := candidate.id;
    else
      insert into public.patients(name,phone,procedure_id) values(customer_name,normalized_number,(payload->>'procedure_id')::uuid) returning id into p_id;
    end if;
  end if;
  insert into public.quotes(patient_id,procedure_id,amount_cents,status,description,session_price_cents,quote_date,intake_key)
  values(p_id,(payload->>'procedure_id')::uuid,(payload->>'amount_cents')::integer,payload->>'status',
    coalesce(payload->>'description',''),(payload->>'session_price_cents')::integer,(payload->>'quote_date')::date,key)
  returning * into q;
  return q;
end;
$$;
revoke all on function public.create_quote_intake(jsonb) from public;
grant execute on function public.create_quote_intake(jsonb) to authenticated;

-- Stable source-row bindings for a future reviewed import. No Google credentials or public endpoint.
create table public.import_links (
  id uuid primary key default gen_random_uuid(),
  source_key text not null check (length(source_key) between 1 and 200),
  external_id text not null check (length(external_id) between 1 and 200),
  patient_id uuid not null references public.patients,
  quote_id uuid references public.quotes,
  created_at timestamptz not null default now(),
  unique(source_key,external_id)
);
alter table public.import_links enable row level security;
revoke all on public.import_links from anon,authenticated;
grant select on public.import_links to authenticated;
create policy admin_read on public.import_links for select to authenticated using (public.is_admin());
-- Writes deliberately disabled until the import review/transaction is configured.
create trigger audit_change after insert or update on public.import_links for each row execute function public.audit_mutation();
commit;
