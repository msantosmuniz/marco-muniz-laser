-- SOMENTE HOMOLOGAÇÃO VAZIA. Na mesma conexão, antes deste script:
-- set app.seed_demo = 'true';
begin;
do $$ begin
  if current_setting('app.seed_demo', true) is distinct from 'true' then raise exception 'Explicit demo seed opt-in required'; end if;
  if exists (select 1 from public.patients) then raise exception 'Seed requires empty patients table'; end if;
end $$;
insert into public.patients(id,name,phone,procedure_id) values
('20000000-0000-4000-8000-000000000001','Paciente Fictício A','13000000000','00000000-0000-4000-8000-000000000001'),
('20000000-0000-4000-8000-000000000002','Paciente Fictício B','13000000000','00000000-0000-4000-8000-000000000002');
insert into public.appointments(id,patient_id,procedure_id,starts_at,duration_minutes,status,price_cents) values
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',date_trunc('day',now()) - interval '2 days' + interval '13 hours',45,'realizado',25000),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002',date_trunc('day',now()) + interval '2 days' + interval '13 hours',45,'agendado',30000);
insert into public.quotes(patient_id,procedure_id,amount_cents,status) values
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',100000,'fechado'),
('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002',120000,'orçamento enviado');
insert into public.payments(appointment_id,amount_cents,paid_at,method) values
('30000000-0000-4000-8000-000000000001',10000,now(),'pix');
commit;
