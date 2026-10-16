import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
test('migração, RLS, privilégios, auditoria, conflitos e financeiro no PostgreSQL', async (t) => {
  const db = new PGlite({ extensions: { btree_gist } });
  t.after(() => db.close());
  await db.exec(`create schema auth; create schema extensions; create role anon; create role authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(
    await readFile(
      new URL('../supabase/migrations/202610150001_initial.sql', import.meta.url),
      'utf8',
    ),
  );
  const admin = '10000000-0000-4000-8000-000000000001';
  const other = '10000000-0000-4000-8000-000000000002';
  const procedure = '00000000-0000-4000-8000-000000000001';
  await db.exec(
    `insert into auth.users values ('${admin}'),('${other}');insert into public.admins(user_id,slot) values('${admin}',1);`,
  );
  await t.test('anônimo não lê pacientes', async () => {
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.patients'), /permission denied/);
    await db.exec('reset role');
  });
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${other}',false)`,
  );
  await t.test('não administrador vê zero registros e não insere', async () => {
    assert.equal((await db.query('select * from public.procedures')).rows.length, 0);
    await assert.rejects(
      db.query(
        `insert into public.patients(name,phone,procedure_id) values('Exemplo','13000000000','${procedure}')`,
      ),
      /row-level security/,
    );
  });
  await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);
  const p = (
    await db.query(
      `insert into public.patients(name,phone,procedure_id) values('Paciente Fictício','13000000000','${procedure}') returning *`,
    )
  ).rows[0];
  await t.test('admin não pode conceder acesso nem falsificar autor da nota', async () => {
    await assert.rejects(
      db.query(`insert into public.admins(user_id,slot) values('${other}',2)`),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        `insert into public.notes(patient_id,content,author_id) values('${p.id}','Fictício','${other}')`,
      ),
      /permission denied/,
    );
  });
  await t.test('mudança produz auditoria sem valores clínicos', async () => {
    await db.query(
      `update public.patients set name='Paciente Exemplo Atualizado' where id='${p.id}'`,
    );
    const audit = (await db.query(`select * from public.audit_events where action='update'`)).rows;
    assert.equal(audit.length, 1);
    assert.deepEqual(audit[0].changed_fields, ['name']);
    assert.equal(audit[0].actor_id, admin);
    assert.ok(!JSON.stringify(audit).includes('Atualizado'));
    await assert.rejects(db.query('delete from public.audit_events'), /permission denied/);
    assert.notEqual(
      (await db.query(`select version from public.patients where id='${p.id}'`)).rows[0].version,
      p.version,
    );
  });
  const insertSession = (start, status = 'agendado') =>
    db.query(
      `insert into public.appointments(patient_id,procedure_id,starts_at,duration_minutes,status,price_cents) values('${p.id}','${procedure}',$1,30,$2,20000) returning *`,
      [start, status],
    );
  const a = (await insertSession('2026-10-15T10:00:00-03:00', 'realizado')).rows[0];
  await t.test('agenda bloqueia sobreposição e permite horários adjacentes', async () => {
    await assert.rejects(insertSession('2026-10-15T10:15:00-03:00'), /exclusion constraint/);
    assert.equal((await insertSession('2026-10-15T10:30:00-03:00')).rows.length, 1);
    assert.equal((await insertSession('2026-10-15T10:15:00-03:00', 'cancelado')).rows.length, 1);
  });
  await t.test('recebimento não pode ultrapassar saldo nem cancelar sessão paga', async () => {
    await db.query(
      `insert into public.payments(appointment_id,amount_cents,paid_at,method) values('${a.id}',12000,now(),'pix')`,
    );
    await assert.rejects(
      db.query(
        `insert into public.payments(appointment_id,amount_cents,paid_at,method) values('${a.id}',9000,now(),'pix')`,
      ),
      /exceeds balance/,
    );
    await assert.rejects(
      db.query(`update public.appointments set status='cancelado' where id='${a.id}'`),
      /Paid session/,
    );
    await assert.rejects(
      db.query(`update public.payments set amount_cents=1`),
      /permission denied/,
    );
  });
  await t.test('mesma submissão de pagamento não duplica recebimento', async () => {
    const key = '40000000-0000-4000-8000-000000000001';
    const insert = () =>
      db.query(
        `insert into public.payments(appointment_id,amount_cents,paid_at,method,idempotency_key) values('${a.id}',1000,now(),'pix','${key}')`,
      );
    await insert();
    await assert.rejects(insert(), /duplicate key/);
  });
  await t.test('ajustar intervalo nunca cria agendamento', async () => {
    const before = (await db.query('select count(*) from public.appointments')).rows;
    await db.query(`update public.procedures set interval_days=70 where id='${procedure}'`);
    assert.deepEqual((await db.query('select count(*) from public.appointments')).rows, before);
  });
  await db.exec(
    `reset role;update public.admins set active=false where user_id='${admin}';set role authenticated;`,
  );
  await t.test('desativação corta acesso mesmo com JWT existente', async () =>
    assert.equal((await db.query('select * from public.patients')).rows.length, 0),
  );
});
test('seed fictício exige opt-in e banco vazio', async (t) => {
  const db = new PGlite({ extensions: { btree_gist } });
  t.after(() => db.close());
  await db.exec(
    `create schema auth;create schema extensions;create role anon;create role authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;`,
  );
  await db.exec(
    await readFile(
      new URL('../supabase/migrations/202610150001_initial.sql', import.meta.url),
      'utf8',
    ),
  );
  const seed = await readFile(new URL('../supabase/seed-demo.sql', import.meta.url), 'utf8');
  await assert.rejects(db.exec(seed), /opt-in required/);
  await db.exec('rollback');
  await db.exec("set app.seed_demo='true'");
  await db.exec(seed);
  assert.equal((await db.query('select * from public.patients')).rows.length, 2);
  assert.equal((await db.query('select * from public.payments')).rows.length, 1);
  await assert.rejects(db.exec(seed), /empty patients/);
  await db.exec('rollback');
});
