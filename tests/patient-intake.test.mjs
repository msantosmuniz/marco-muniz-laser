import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

test('cadastro rápido: acesso privado, reutilização segura, auditoria e preservação dos dados', async (t) => {
  const db = new PGlite({ extensions: { btree_gist } });
  t.after(() => db.close());
  const admin = '10000000-0000-4000-8000-000000000001';
  const other = '10000000-0000-4000-8000-000000000002';
  const procedure = '00000000-0000-4000-8000-000000000001';
  await db.exec(`create schema auth;create schema extensions;create role anon;create role authenticated;
    create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for (const file of [
    '202610150001_initial.sql',
    '202610160001_quotes.sql',
    '202610160002_patient_intake.sql',
  ])
    await db.exec(
      await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'),
    );
  await db.exec(
    `insert into auth.users values('${admin}'),('${other}');insert into public.admins(user_id,slot) values('${admin}',1);`,
  );
  const input = { name: 'Cliente Fictício', phone: '13900000000', procedure_id: procedure };
  const intake = (payload) =>
    db.query('select * from public.create_patient_intake($1::jsonb)', [JSON.stringify(payload)]);
  await db.exec('set role anon');
  await assert.rejects(intake(input), /permission denied/);
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${other}',false)`,
  );
  await assert.rejects(intake(input), /Forbidden/);
  await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);
  const customer = (await intake(input)).rows[0];
  assert.equal(customer.phone, '5513900000000');
  const retry = (
    await intake({ ...input, name: ' cliente   fictício ', phone: '5513900000000' })
  ).rows[0];
  // Both accepted digit-only formats reuse the same customer.
  assert.equal(retry.id, customer.id);
  assert.equal(retry.version, customer.version);
  assert.equal(retry.name, customer.name);
  await assert.rejects(intake({ ...input, name: 'Outra Pessoa' }), /Phone already registered/);
  await assert.rejects(intake({ ...input, name: '', phone: '13900000001' }), /Invalid customer/);
  await assert.rejects(intake({ ...input, phone: null }), /Invalid customer/);
  await assert.rejects(
    intake({ ...input, phone: '13900000001', procedure_id: other }),
    /foreign key/,
  );
  assert.equal((await db.query('select count(*) from public.patients')).rows[0].count, 1);
  assert.equal((await db.query('select count(*) from public.appointments')).rows[0].count, 0);
  assert.equal((await db.query('select count(*) from public.quotes')).rows[0].count, 0);
  const audit = (await db.query("select * from public.audit_events where entity='patients'")).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor_id, admin);
  assert.ok(!JSON.stringify(audit).includes('Fictício'));
  await db.query('insert into public.patients(name,phone,procedure_id) values($1,$2,$3)', [
    'Legado',
    '13900000000',
    procedure,
  ]);
  await assert.rejects(intake(input), /Ambiguous phone/);
});
