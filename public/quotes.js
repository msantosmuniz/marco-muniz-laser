import { localDate, money } from './domain.js';

export const quoteStatuses = ['aguardando', 'fechado', 'perdido'];
export const quoteStatus = (quote) =>
  ['fechado', 'perdido'].includes(quote.status) ? quote.status : 'aguardando';
export const quoteDay = (quote) => quote.quote_date || localDate(quote.created_at);
export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const normalizePhone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
};
export const normalizeName = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');

export function quoteMetrics(quotes, month) {
  const cohort = quotes.filter((q) => quoteDay(q).startsWith(month));
  const closed = cohort.filter((q) => quoteStatus(q) === 'fechado');
  return {
    count: cohort.length,
    amount: cohort.reduce((sum, q) => sum + q.amount_cents, 0),
    closed: closed.length,
    closedAmount: closed.reduce((sum, q) => sum + q.amount_cents, 0),
    conversion: cohort.length ? Math.round((closed.length / cohort.length) * 100) : 0,
    lost: cohort.filter((q) => quoteStatus(q) === 'perdido').length,
  };
}

// Derived reminders have no queue/job to accidentally send after closure.
// At day 15, the latest stage supersedes a missed day-7 reminder.
export function quoteReminders(quotes, contacts = [], today = localDate(new Date())) {
  return quotes
    .flatMap((q) => {
      if (quoteStatus(q) !== 'aguardando') return [];
      const days = Math.floor(
        (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${quoteDay(q)}T12:00:00Z`)) / 86400000,
      );
      const stage = days >= 15 ? 15 : days >= 7 ? 7 : null;
      if (!stage || contacts.some((c) => c.quote_id === q.id && c.stage === stage)) return [];
      return [{ quote: q, stage, days }];
    })
    .sort((a, b) => b.days - a.days);
}

export function quoteMessage(quote, patient, procedure, stage) {
  const firstName = patient.name.trim().split(/\s+/)[0];
  if (stage === 7)
    return `Olá, ${firstName}! Aqui é da Marco Muniz – Tratamento a Laser em Santos. Há alguns dias conversamos sobre seu orçamento. Ficou alguma dúvida? Estamos à disposição para ajudar. Se preferir não receber novos contatos, é só nos avisar.`;
  if (stage === 15)
    return `Olá, ${firstName}! Somos da Marco Muniz – Tratamento a Laser em Santos. Gostaria de retomar seu orçamento ou conversar sobre o próximo passo? Podemos ajudar quando for um bom momento para você. Se preferir não receber novos contatos, é só nos avisar.`;
  return `Olá, ${patient.name}!\nSeu orçamento personalizado — Marco Muniz – Tratamento a Laser em Santos\nData: ${quoteDay(quote).split('-').reverse().join('/')}\nProcedimento: ${procedure.name}\n${quote.description ? `Descrição: ${quote.description}\n` : ''}${quote.session_price_cents != null ? `Valor por sessão: ${money(quote.session_price_cents)}\n` : ''}Valor orçado: ${money(quote.amount_cents)}\nPara esclarecer dúvidas e combinar seu atendimento, responda por aqui. O orçamento não reserva horário e o plano de tratamento depende de avaliação.`;
}

export function whatsappLink(phone, message) {
  const normalized = normalizePhone(phone);
  if (!/^\d{12,13}$/.test(normalized))
    throw new Error('Confira o telefone com código do país e DDD antes de compartilhar.');
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function quoteDocument(quote, patient, procedure) {
  const e = escapeHtml;
  return `<article class="quote-document"><header class="quote-brand"><span class="mark">M</span><div><strong>MARCO MUNIZ</strong><p>Tratamento a Laser em Santos</p></div></header><div class="quote-document-heading"><h2>Orçamento personalizado</h2><p>${quoteDay(quote).split('-').reverse().join('/')} · Ref. ${e(quote.id.slice(0, 8))}</p></div><dl><dt>Cliente</dt><dd>${e(patient.name)}</dd><dt>Telefone</dt><dd>${e(patient.phone)}</dd><dt>Procedimento</dt><dd>${e(procedure.name)}</dd></dl><p class="quote-description">${e(quote.description || 'Descrição a combinar na avaliação.')}</p><div class="quote-prices"><p>Valor por sessão<strong>${quote.session_price_cents == null ? 'Não informado no registro original' : money(quote.session_price_cents)}</strong></p><p>Valor orçado<strong>${money(quote.amount_cents)}</strong></p></div><p class="hint">O plano e a quantidade de sessões dependem de avaliação. Este orçamento não representa pagamento nem reserva de horário.</p><footer>Santos/SP · WhatsApp (13) 99750-5099</footer></article>`;
}
