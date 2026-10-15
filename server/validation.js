export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const uuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const text = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const date = (v) => {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/.test(v) ||
    !Number.isFinite(Date.parse(v))
  )
    return false;
  const day = v.slice(0, 10);
  return new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
};
const oneOf = (values) => (value) => values.includes(value);
export const schemas = {
  patients: {
    name: (v) => text(v, 2, 120),
    phone: (v) => typeof v === 'string' && /^\d{10,13}$/.test(v),
    procedure_id: uuid,
  },
  notes: { patient_id: uuid, content: (v) => text(v, 1, 4000) },
  appointments: {
    patient_id: uuid,
    procedure_id: uuid,
    starts_at: date,
    duration_minutes: (v) => integer(v, 5, 240),
    status: oneOf(['agendado', 'cancelado', 'realizado']),
    price_cents: (v) => integer(v, 0, 100000000),
  },
  quotes: {
    patient_id: uuid,
    procedure_id: uuid,
    amount_cents: (v) => integer(v, 0, 100000000),
    status: oneOf(['novo', 'orçamento enviado', 'fechado', 'sem resposta', 'perdido']),
  },
  payments: {
    appointment_id: uuid,
    amount_cents: (v) => integer(v, 1, 100000000),
    paid_at: date,
    method: oneOf(['pix', 'dinheiro', 'cartão', 'transferência']),
    idempotency_key: uuid,
  },
  procedures: { interval_days: (v) => integer(v, 1, 730) },
};
export function validate(entity, input) {
  const schema = schemas[entity];
  if (!schema || !input || typeof input !== 'object' || Array.isArray(input))
    throw new HttpError(400, 'Dados inválidos.');
  if (Object.keys(input).some((k) => !Object.hasOwn(schema, k)))
    throw new HttpError(400, 'Campo não permitido.');
  for (const [key, check] of Object.entries(schema))
    if (!check(input[key])) throw new HttpError(400, `Confira o campo ${key}.`);
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value,
    ]),
  );
}
