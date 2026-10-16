import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
test('orçamentos: migração incremental, RLS, intake atômico e contatos', async (t) => {
  const db = new PGlite({ extensions: { btree_gist } });
  t.after(() => db.close());
  const admin = '10000000-0000-4000-8000-000000000001';
  const other = '10000000-0000-4000-8000-000000000002';
  const procedure = '00000000-0000-4000-8000-000000000001';
  await db.exec(`create schema auth;create schema extensions;create role anon;create role authenticated;
    create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(
    await readFile(
      new URL('../supabase/migrations/202610150001_initial.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.exec(
    `insert into auth.users values('${admin}'),('${other}');insert into public.admins(user_id,slot) values('${admin}',1);`,
  );
  const p = (
    await db.query(
      `insert into public.patients(name,phone,procedure_id) values('Exemplo','13900000000','${procedure}') returning *`,
    )
  ).rows[0];
  const legacy = (
    await db.query(
      `insert into public.quotes(patient_id,procedure_id,amount_cents,status) values('${p.id}','${procedure}',95000,'sem resposta') returning *`,
    )
  ).rows[0];
  await db.exec(
    await readFile(
      new URL('../supabase/migrations/202610160001_quotes.sql', import.meta.url),
      'utf8',
    ),
  );
  await t.test(
    'migração não reinterpreta valor antigo nem altera identidade e versão',
    async () => {
      const current = (await db.query('select * from public.quotes where id=$1', [legacy.id]))
        .rows[0];
      for (const key of ['id', 'patient_id', 'amount_cents', 'status', 'version'])
        assert.equal(current[key], legacy[key]);
      assert.equal(current.session_price_cents, null);
      assert.equal(current.quote_date, null);
    },
  );
  const payload = {
    patient_id: null,
    name: 'Exemplo',
    phone: '5513900000000',
    procedure_id: procedure,
    description: 'Fictício',
    amount_cents: 10050,
    session_price_cents: 10050,
    quote_date: '2020-01-01',
    status: 'aguardando',
    intake_key: crypto.randomUUID(),
  };
  const intake = (p) =>
    db.query('select * from public.create_quote_intake($1::jsonb)', [JSON.stringify(p)]);
  await db.exec(`set role anon`);
  await t.test('anônimo não lê propostas e não executa intake', async () => {
    for (const table of ['quotes', 'quote_contacts', 'import_links'])
      await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
    await assert.rejects(intake(payload), /permission denied/);
  });
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${other}',false)`,
  );
  await t.test('não administrador não lê nem grava', async () => {
    assert.equal((await db.query('select * from public.quotes')).rows.length, 0);
    await assert.rejects(intake(payload), /Forbidden/);
  });
  await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);
  const q = (await intake(payload)).rows[0];
  await t.test(
    'telefone com e sem país reutiliza paciente; retry não duplica orçamento',
    async () => {
      assert.equal(q.patient_id, p.id);
      assert.equal((await intake(payload)).rows[0].id, q.id);
      assert.equal((await db.query('select count(*) from public.patients')).rows[0].count, 1);
      assert.equal((await db.query('select count(*) from public.quotes')).rows[0].count, 2);
      await assert.rejects(
        intake({
          ...payload,
          intake_key: crypto.randomUUID(),
          name: 'Pessoa diferente',
        }),
        /Phone already registered/,
      );
    },
  );
  await t.test('falha de orçamento desfaz criação do cliente', async () => {
    await assert.rejects(
      intake({
        ...payload,
        intake_key: crypto.randomUUID(),
        name: 'Novo Fictício',
        phone: '13900000001',
        amount_cents: -1,
      }),
      /check constraint/,
    );
    assert.equal((await db.query('select count(*) from public.patients')).rows[0].count, 1);
    const fresh = (
      await intake({
        ...payload,
        intake_key: crypto.randomUUID(),
        name: 'Novo Fictício',
        phone: '13900000001',
      })
    ).rows[0];
    assert.notEqual(fresh.patient_id, p.id);
  });
  await t.test(
    'contato exige orçamento aberto, vencimento, etapa única e autor do token',
    async () => {
      const contact = (
        await db.query(
          'insert into public.quote_contacts(quote_id,stage) values($1,7) returning *',
          [q.id],
        )
      ).rows[0];
      assert.equal(contact.actor_id, admin);
      await assert.rejects(
        db.query('insert into public.quote_contacts(quote_id,stage) values($1,7)', [q.id]),
        /duplicate key/,
      );
      await assert.rejects(
        db.query('insert into public.quote_contacts(quote_id,stage,actor_id) values($1,15,$2)', [
          q.id,
          other,
        ]),
        /permission denied/,
      );
      await db.query("update public.quotes set status='fechado' where id=$1", [q.id]);
      await assert.rejects(
        db.query('insert into public.quote_contacts(quote_id,stage) values($1,15)', [q.id]),
        /Quote is closed/,
      );
      await db.query("update public.quotes set status='perdido' where id=$1", [q.id]);
      await assert.rejects(
        db.query('insert into public.quote_contacts(quote_id,stage) values($1,15)', [q.id]),
        /Quote is closed/,
      );
      await db.query(
        "update public.quotes set status='aguardando', quote_date='2099-01-01' where id=$1",
        [q.id],
      );
      await assert.rejects(
        db.query('insert into public.quote_contacts(quote_id,stage) values($1,15)', [q.id]),
        /not due/,
      );
      await assert.rejects(db.query('delete from public.quote_contacts'), /permission denied/);
      const audit = (
        await db.query("select * from public.audit_events where entity='quote_contacts'")
      ).rows;
      assert.equal(audit.length, 1);
      assert.equal(audit[0].actor_id, admin);
    },
  );
  await t.test(
    'integração Drive permanece sem permissão de escrita e constraints impedem valores inválidos',
    async () => {
      await assert.rejects(
        db.query(
          'insert into public.import_links(source_key,external_id,patient_id) values($1,$2,$3)',
          ['sheet', 'row', p.id],
        ),
        /permission denied/,
      );
      await assert.rejects(
        db.query('update public.quotes set session_price_cents=-1 where id=$1', [q.id]),
        /check constraint/,
      );
      await assert.rejects(
        db.query('update public.quotes set description=$1 where id=$2', ['x'.repeat(4001), q.id]),
        /check constraint/,
      );
    },
  );
});
