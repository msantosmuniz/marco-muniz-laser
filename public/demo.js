export function createDemo() {
  const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const date = (day, time = '13:00') =>
    `${year}-${month}-${String(day).padStart(2, '0')}T${time}:00-03:00`;
  const procedures = [
    { id: id(1), name: 'Remoção de tatuagem', interval_days: 60 },
    { id: id(2), name: 'Remoção de micropigmentação', interval_days: 30 },
    { id: id(3), name: 'Tratamento de onicomicose', interval_days: 15 },
  ].map((p) => ({ ...p, version: crypto.randomUUID() }));
  const patients = [
    'Paciente Exemplo A',
    'Paciente Exemplo B',
    'Paciente Exemplo C',
    'Paciente Exemplo D',
  ].map((name, i) => ({
    id: id(10 + i),
    name,
    phone: '13000000000',
    procedure_id: procedures[i % 3].id,
    created_at: date(1 + i),
    version: crypto.randomUUID(),
  }));
  const appointments = patients.map((p, i) => ({
    id: id(20 + i),
    patient_id: p.id,
    procedure_id: p.procedure_id,
    starts_at: date(i < 2 ? 5 : Math.min(28, now.getDate() + i), `${10 + i}:00`),
    duration_minutes: 45,
    status: i < 2 ? 'realizado' : 'agendado',
    price_cents: 25000 + i * 5000,
    created_at: date(1),
    version: crypto.randomUUID(),
  }));
  return {
    user: { email: 'administrador@exemplo.invalid' },
    procedures,
    patients,
    appointments,
    notes: [
      {
        id: id(30),
        patient_id: patients[0].id,
        content:
          'Registro fictício para demonstração do histórico. Não representa uma orientação clínica.',
        created_at: date(5),
        author_id: id(99),
      },
    ],
    quotes: patients.map((p, i) => ({
      id: id(40 + i),
      patient_id: p.id,
      procedure_id: p.procedure_id,
      amount_cents: 90000 + i * 10000,
      status: ['fechado', 'orçamento enviado', 'novo', 'sem resposta'][i],
      created_at: date(2 + i),
      version: crypto.randomUUID(),
    })),
    payments: [
      {
        id: id(50),
        appointment_id: appointments[0].id,
        amount_cents: 25000,
        method: 'pix',
        paid_at: date(5),
        created_at: date(5),
      },
    ],
    audit_events: [
      {
        id: id(60),
        actor_id: id(99),
        action: 'login',
        entity: 'workspace',
        created_at: new Date().toISOString(),
        changed_fields: [],
      },
    ],
  };
}
