import test from 'node:test';
import assert from 'node:assert/strict';
import {
  quoteReminders,
  quoteMetrics,
  quoteStatus,
  quoteDay,
  quoteDocument,
  whatsappLink,
  quoteMessage,
} from '../public/quotes.js';
import { validateQuoteIntake, validate } from '../server/validation.js';
import { previewImport } from '../server/import-preview.js';
const id = '10000000-0000-4000-8000-000000000001';
const quote = {
  id,
  status: 'aguardando',
  quote_date: '2026-10-01',
  amount_cents: 10050,
  session_price_cents: 10050,
};

test('lembretes: limites de 7/15 dias, etapas registradas e encerramento automático', () => {
  assert.equal(quoteReminders([quote], [], '2026-10-07').length, 0);
  assert.equal(quoteReminders([quote], [], '2026-10-08')[0].stage, 7);
  assert.equal(quoteReminders([quote], [], '2026-10-15')[0].stage, 7);
  assert.equal(quoteReminders([quote], [], '2026-10-16')[0].stage, 15);
  const contacts = [{ quote_id: id, stage: 7 }];
  assert.equal(quoteReminders([quote], contacts, '2026-10-08').length, 0);
  assert.equal(quoteReminders([quote], contacts, '2026-10-16')[0].stage, 15);
  contacts.push({ quote_id: id, stage: 15 });
  assert.equal(quoteReminders([quote], contacts, '2026-10-30').length, 0);
  for (const status of ['fechado', 'perdido']) {
    assert.equal(quoteReminders([{ ...quote, status }], [], '2026-10-30').length, 0);
  }
  assert.equal(quoteReminders([quote], [], '2026-09-30').length, 0);
});
test('compatibilidade de status e datas legadas no fuso de Santos', () => {
  for (const status of ['novo', 'orçamento enviado', 'sem resposta'])
    assert.equal(quoteStatus({ status }), 'aguardando');
  assert.equal(quoteDay({ created_at: '2026-11-01T01:00:00Z' }), '2026-10-31');
  assert.equal(
    quoteDay({ quote_date: '2026-01-01', created_at: '2026-11-01T01:00:00Z' }),
    '2026-01-01',
  );
});
test('métricas mensais usam data do orçamento e centavos; fechamento não é recebimento', () => {
  assert.deepEqual(
    quoteMetrics(
      [
        quote,
        { ...quote, status: 'fechado' },
        { ...quote, status: 'perdido' },
        { ...quote, quote_date: '2026-09-30' },
      ],
      '2026-10',
    ),
    {
      count: 3,
      amount: 30150,
      closed: 1,
      closedAmount: 10050,
      conversion: 33,
      lost: 1,
    },
  );
  assert.equal(quoteMetrics([], '2026-10').conversion, 0);
});
test('documento escapa conteúdo e WhatsApp codifica texto sem links públicos do orçamento', () => {
  const p = { name: '<img src=x onerror=alert(1)>', phone: '13900000000' };
  const q = { ...quote, description: '<script>bad</script>"&' };
  const html = quoteDocument(q, p, { name: '<b>Fictício</b>' });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;script&gt;/);
  const message = quoteMessage(q, p, { name: 'Fictício' });
  const url = new URL(whatsappLink(p.phone, message));
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/5513900000000');
  assert.equal(url.searchParams.get('text'), message);
  assert.ok(!quoteMessage(q, { name: 'Exemplo' }, { name: 'Clínico' }, 7).includes('Clínico'));
  assert.throws(() => whatsappLink('123', message));
});
test('intake valida novos clientes e impede campos privilegiados e datas inválidas', () => {
  const input = {
    ...quote,
    patient_id: null,
    procedure_id: id,
    name: 'Exemplo',
    phone: '13900000000',
    intake_key: id,
    description: '',
  };
  delete input.id;
  assert.equal(validateQuoteIntake(input).patient_id, null);
  for (const extra of [
    { role: 'admin' },
    { quote_date: '2026-02-30' },
    { session_price_cents: -1 },
    { intake_key: null },
    { created_at: '2020-01-01' },
  ])
    assert.throws(() => validateQuoteIntake({ ...input, ...extra }));
  assert.throws(() => validateQuoteIntake({ ...input, patient_id: id }));
  assert.throws(() => validate('quote_contacts', { quote_id: id, stage: 7, actor_id: id }));
  assert.throws(() => validate('quote_contacts', { quote_id: id, stage: 8 }));
});
test('prévia Drive é idempotente, bloqueia ambiguidades e não modifica cadastros', () => {
  const patients = [{ id, name: 'Exemplo', phone: '13900000000' }];
  const original = JSON.stringify(patients);
  const rows = [
    { external_id: '1', name: 'EXEMPLO', phone: '+55 (13) 90000-0000' },
    { external_id: '2', name: 'Outro', phone: '13900000000' },
    { external_id: '3', name: 'Novo', phone: '13900000001' },
    { external_id: '4', name: 'Importado', phone: '13900000002' },
    { external_id: '', name: 'Inválido', phone: '123' },
  ];
  const result = previewImport(
    rows,
    patients,
    [{ source_key: 'sheet', external_id: '4', patient_id: id }],
    'sheet',
  );
  assert.deepEqual(
    result.map((r) => r.action),
    ['propose_link', 'review', 'propose_new', 'skip', 'review'],
  );
  assert.equal(previewImport([rows[1]], patients, [], 'sheet')[0].reason, 'ambiguous_customer');
  assert.equal(
    previewImport([rows[0]], [...patients, ...patients], [], 'sheet')[0].reason,
    'ambiguous_customer',
  );
  assert.equal(JSON.stringify(patients), original);
});
