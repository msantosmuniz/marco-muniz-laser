begin;
-- Quick registration shares the phone lock with create_quote_intake. Never merge by phone alone.
create function public.create_patient_intake(payload jsonb)
returns public.patients language plpgsql security invoker set search_path = '' as $$
declare
  candidate public.patients;
  normalized_number text := public.normalized_phone(payload->>'phone');
  customer_name text := btrim(payload->>'name');
  matches integer;
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  if customer_name is null or length(customer_name) not between 2 and 120
    or normalized_number is null or normalized_number !~ '^[0-9]{12,13}$'
    then raise exception 'Invalid customer'; end if;
  perform pg_advisory_xact_lock(hashtextextended(normalized_number,1));
  select count(*) into matches from public.patients where public.normalized_phone(phone)=normalized_number;
  if matches>1 then raise exception using errcode='P0002',message='Ambiguous phone'; end if;
  if matches=1 then
    select * into candidate from public.patients where public.normalized_phone(phone)=normalized_number;
    if lower(regexp_replace(btrim(candidate.name),'\s+',' ','g')) <> lower(regexp_replace(customer_name,'\s+',' ','g'))
      then raise exception using errcode='P0002',message='Phone already registered'; end if;
    return candidate;
  end if;
  insert into public.patients(name,phone,procedure_id)
    values(customer_name,normalized_number,(payload->>'procedure_id')::uuid) returning * into candidate;
  return candidate;
end;
$$;
revoke all on function public.create_patient_intake(jsonb) from public;
grant execute on function public.create_patient_intake(jsonb) to authenticated;
commit;
