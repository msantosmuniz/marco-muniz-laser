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
const calendarDate = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(`${v}T12:00:00Z`)) &&
  new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
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
    status: oneOf([
      'novo',
      'orçamento enviado',
      'fechado',
      'sem resposta',
      'perdido',
      'aguardando',
    ]),
    description: (v) => v === undefined || text(v, 0, 4000),
    session_price_cents: (v) => v == null || integer(v, 0, 100000000),
    quote_date: (v) => v == null || calendarDate(v),
  },
  quote_contacts: { quote_id: uuid, stage: oneOf([7, 15]) },
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
export function validateQuoteIntake(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new HttpError(400, 'Dados inválidos.');
  const { name, phone, intake_key, ...quote } = input;
  if (!uuid(intake_key)) throw new HttpError(400, 'Identificador de submissão obrigatório.');
  if (!calendarDate(quote.quote_date) || !integer(quote.session_price_cents, 0, 100000000))
    throw new HttpError(400, 'Informe a data e o valor por sessão.');
  const isNew = quote.patient_id === null;
  if (isNew && (!text(name, 2, 120) || typeof phone !== 'string' || !/^\d{10,13}$/.test(phone)))
    throw new HttpError(400, 'Confira nome e telefone do cliente.');
  if (!isNew && (name !== undefined || phone !== undefined))
    throw new HttpError(400, 'Escolha um cliente existente ou um novo cadastro.');
  const clean = validate('quotes', {
    ...quote,
    patient_id: isNew ? intake_key : quote.patient_id,
  });
  return {
    ...clean,
    patient_id: isNew ? null : clean.patient_id,
    intake_key,
    ...(isNew ? { name: name.trim(), phone } : {}),
  };
}
