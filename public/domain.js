export const statuses = ['novo', 'orçamento enviado', 'fechado', 'sem resposta', 'perdido'];
export const money = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((value || 0) / 100);
export const localDate = (value) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date(value));
export function suggestedReturn(start, days) {
  const date = new Date(`${localDate(start)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function monthlyMetrics(data, month) {
  const inMonth = (value) => value && localDate(value).startsWith(month);
  const quotes = data.quotes.filter((q) => inMonth(q.created_at));
  const sessions = data.appointments.filter(
    (a) => a.status === 'realizado' && inMonth(a.starts_at),
  );
  const payments = data.payments.filter((p) => inMonth(p.paid_at));
  return {
    patients: data.patients.filter((p) => inMonth(p.created_at)).length,
    quotes: quotes.length,
    conversions: quotes.filter((q) => q.status === 'fechado').length,
    conversionRate: quotes.length
      ? Math.round((quotes.filter((q) => q.status === 'fechado').length / quotes.length) * 100)
      : 0,
    sessions: sessions.length,
    revenue: payments.reduce((sum, p) => sum + p.amount_cents, 0),
    billed: sessions.reduce((sum, a) => sum + a.price_cents, 0),
  };
}
export function outstanding(data, appointment) {
  return (
    appointment.price_cents -
    data.payments
      .filter((p) => p.appointment_id === appointment.id)
      .reduce((sum, p) => sum + p.amount_cents, 0)
  );
}
