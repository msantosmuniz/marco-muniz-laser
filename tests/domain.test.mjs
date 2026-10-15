import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestedReturn, monthlyMetrics, outstanding } from '../public/domain.js';
import { validate } from '../server/validation.js';
test('intervalos atravessam meses e anos sem criar agendamentos', () => {
  assert.equal(suggestedReturn('2026-12-20T12:00:00-03:00', 60), '2027-02-18');
  assert.equal(suggestedReturn('2026-10-15T12:00:00-03:00', 30), '2026-11-14');
  assert.equal(suggestedReturn('2026-10-15T12:00:00-03:00', 15), '2026-10-30');
});
test('dashboard usa mês de Brasília, coorte de orçamentos e recebimentos reais', () => {
  const data = {
    patients: [{ created_at: '2026-11-01T01:00:00Z' }],
    quotes: [
      { created_at: '2026-10-02T12:00:00Z', status: 'fechado' },
      { created_at: '2026-10-03T12:00:00Z', status: 'perdido' },
    ],
    appointments: [
      { id: 'a', status: 'realizado', starts_at: '2026-10-04T12:00:00Z', price_cents: 30000 },
      { id: 'b', status: 'cancelado', starts_at: '2026-10-04T12:00:00Z', price_cents: 30000 },
    ],
    payments: [
      { appointment_id: 'a', paid_at: '2026-10-05T12:00:00Z', amount_cents: 10000 },
      { appointment_id: 'a', paid_at: '2026-11-05T12:00:00Z', amount_cents: 10000 },
    ],
  };
  assert.deepEqual(monthlyMetrics(data, '2026-10'), {
    patients: 1,
    quotes: 2,
    conversions: 1,
    conversionRate: 50,
    sessions: 1,
    revenue: 10000,
    billed: 30000,
  });
  assert.equal(outstanding(data, data.appointments[0]), 10000);
});
test('validação bloqueia campos administrativos, valores negativos e texto excessivo', () => {
  assert.throws(() => validate('procedures', { interval_days: 0 }));
  assert.throws(() => validate('procedures', { interval_days: 60, role: 'admin' }));
  assert.throws(() =>
    validate('notes', {
      patient_id: '00000000-0000-4000-8000-000000000001',
      content: 'a'.repeat(4001),
    }),
  );
  assert.deepEqual(validate('procedures', { interval_days: 30 }), { interval_days: 30 });
});
