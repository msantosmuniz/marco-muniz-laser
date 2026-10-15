import {
  statuses,
  money,
  localDate,
  monthlyMetrics,
  outstanding,
  suggestedReturn,
} from './domain.js';
import { createDemo } from './demo.js';
const root = document.querySelector('#root');
const dialog = document.querySelector('#editor');
const notice = document.querySelector('#notice');
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
let data,
  demo = false,
  page = 'dashboard',
  search = '',
  month = localDate(new Date()).slice(0, 7),
  patientId = null;
let refreshPromise;
const names = {
  dashboard: 'Visão geral',
  patients: 'Pacientes',
  appointments: 'Agenda',
  quotes: 'Orçamentos',
  payments: 'Financeiro',
  procedures: 'Configurações',
  audit: 'Atividades',
};
const icons = {
  dashboard: '◫',
  patients: '◉',
  appointments: '▦',
  quotes: '▤',
  payments: '↗',
  procedures: '⚙',
  audit: '◷',
};
const patient = (id) => data.patients.find((p) => p.id === id);
const procedure = (id) => data.procedures.find((p) => p.id === id);
const dateTime = (value) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
const badge = (status) =>
  `<span class="badge ${status === 'realizado' || status === 'fechado' ? 'success' : status === 'cancelado' || status === 'perdido' ? 'muted' : ''}">${escape(status)}</span>`;
const empty = (text) => `<div class="empty">${escape(text)}</div>`;
const action = (label, entity, id = '') =>
  `<button class="secondary small" data-edit="${entity}" data-id="${id}">${label}</button>`;
function notify(text, error = false) {
  notice.textContent = text;
  notice.className = error ? 'error visible' : 'visible';
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    notice.className = '';
  }, 7000);
}
async function api(path, method = 'GET', body, retry = true) {
  const result = await fetch(`/api/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (result.status === 401 && retry && !['login', 'refresh', 'logout'].includes(path)) {
    refreshPromise ||= api('refresh', 'POST', {}, false).finally(() => {
      refreshPromise = undefined;
    });
    try {
      await refreshPromise;
      return api(path, method, body, false);
    } catch {
      clearWorkspace();
      throw new Error('Sessão encerrada. Entre novamente.');
    }
  }
  const payload = await result.json();
  if (!result.ok) throw new Error(payload.error || 'Não foi possível concluir.');
  return payload;
}
function login() {
  root.innerHTML = `<main class="login"><section class="login-story"><a class="brand" href="/"><span class="mark">M</span><span>MARCO MUNIZ<small>LASER · SANTOS</small></span></a><div><span class="eyebrow">CUIDADO EM CADA ETAPA</span><h1>Mais atenção<br>às pessoas.<br>Mais clareza<br>na gestão.</h1><p>Um espaço para organizar o dia a dia da clínica.</p></div><small>Acesso exclusivo da equipe</small></section><section class="login-form"><span class="eyebrow">GESTÃO DA CLÍNICA</span><h2>Bem-vindo de volta.</h2><p>Entre com sua conta individual para continuar.</p><form id="login-form"><label>E-mail<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Senha<input name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="256"></label><p id="login-error" class="form-error" role="alert"></p><button class="primary">Entrar na intranet <span>→</span></button></form><p class="hint">Acesso por convite. Para recuperar sua conta, procure o responsável pelo Supabase da clínica.</p>${['localhost', '127.0.0.1'].includes(location.hostname) ? '<button id="demo" class="secondary">Explorar com dados fictícios</button><p class="hint">Demonstração local. Dados apenas em memória.</p>' : ''}</section></main>`;
  document.querySelector('#demo')?.addEventListener('click', () => {
    demo = true;
    data = createDemo();
    render();
  });
  document.querySelector('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    try {
      await api('login', 'POST', Object.fromEntries(new FormData(event.target)));
      data = await api('data');
      render();
    } catch (error) {
      document.querySelector('#login-error').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}
function clearWorkspace() {
  data = undefined;
  demo = false;
  page = 'dashboard';
  patientId = null;
  search = '';
  dialog.close();
  dialog.replaceChildren();
  login();
}
function render() {
  root.innerHTML = `<div class="shell"><aside class="sidebar"><a href="/" class="brand"><span class="mark">M</span><span>MARCO MUNIZ<small>LASER · GESTÃO</small></span></a><span class="nav-label">CLÍNICA</span><nav aria-label="Menu principal">${Object.entries(
    names,
  )
    .map(
      ([key, label]) =>
        `<button data-page="${key}" class="nav-item ${page === key ? 'active' : ''}" ${page === key ? 'aria-current="page"' : ''}><span aria-hidden="true">${icons[key]}</span>${label}</button>`,
    )
    .join(
      '',
    )}</nav><div class="sidebar-bottom"><span class="avatar">AD</span><div><strong>Administrador</strong><small>${demo ? 'Demonstração' : 'Conta individual'}</small></div><button id="logout" aria-label="Sair" title="Sair">↪</button></div></aside><main class="workspace">${demo ? '<div class="demo-banner">DEMONSTRAÇÃO · Somente dados fictícios em memória. Alterações são descartadas ao sair ou recarregar.</div>' : ''}<header class="topbar"><span>Clínica <span class="breadcrumb">/ ${names[page]}</span></span><span class="location">Santos, SP <span class="dot"></span> ${demo ? 'Ambiente de teste' : 'Área restrita'}</span></header><div class="content"><div class="page-heading"><div><span class="eyebrow">MARCO MUNIZ LASER</span><h1>${names[page]}</h1><p>${{ dashboard: 'O cuidado começa com uma rotina bem organizada.', patients: 'Pessoas, procedimentos e histórico em um só lugar.', appointments: 'Organize sessões e acompanhe os próximos retornos.', quotes: 'Acompanhe cada oportunidade, do contato à decisão.', payments: 'Valores das sessões e recebimentos da clínica.', procedures: 'Intervalos sugeridos e preferências da clínica.', audit: 'Rastreabilidade das ações dos administradores.' }[page]}</p></div>${['dashboard', 'appointments', 'payments'].includes(page) ? `<label class="month-filter">Mês de referência<input id="month" type="month" value="${month}" required></label>` : ''}</div><section id="page-content">${content()}</section><footer>Marco Muniz Laser <span>Gestão com cuidado · Horários de Brasília</span></footer></div></main></div>`;
  root.querySelectorAll('[data-page]').forEach(
    (button) =>
      (button.onclick = () => {
        page = button.dataset.page;
        patientId = null;
        search = '';
        render();
      }),
  );
  document.querySelector('#month')?.addEventListener('change', (event) => {
    if (/^\d{4}-\d{2}$/.test(event.target.value)) {
      month = event.target.value;
      render();
    }
  });
  document.querySelector('#logout').onclick = async () => {
    try {
      if (!demo) {
        const result = await api('logout', 'POST', {});
        if (!result.revoked)
          notify('Sessão local encerrada. A revogação remota não pôde ser confirmada.');
      }
    } catch (error) {
      notify(error.message, true);
      return;
    }
    clearWorkspace();
  };
  bindContent();
  const refreshButton = document.createElement('button');
  refreshButton.className = 'refresh';
  refreshButton.textContent = 'Atualizar dados';
  refreshButton.onclick = async () => {
    refreshButton.disabled = true;
    try {
      if (!demo) data = await api('data');
      render();
      notify('Dados atualizados.');
    } catch (error) {
      notify(error.message, true);
    } finally {
      refreshButton.disabled = false;
    }
  };
  root.querySelector('.topbar').append(refreshButton);
}
function content() {
  if (page === 'dashboard') {
    const m = monthlyMetrics(data, month);
    const upcoming = data.appointments
      .filter((a) => a.status === 'agendado' && new Date(a.starts_at) >= new Date())
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 4);
    return `<div class="metrics">${[
      ['Novos pacientes', m.patients, 'Cadastros no mês'],
      ['Orçamentos', m.quotes, `${m.conversions} fechados · ${m.conversionRate}% de conversão`],
      ['Sessões realizadas', m.sessions, 'Atendimentos no mês'],
      ['Receita recebida', money(m.revenue), 'Pela data do pagamento'],
    ]
      .map(
        ([label, value, hint], i) =>
          `<article class="metric ${i === 3 ? 'featured' : ''}"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`,
      )
      .join(
        '',
      )}</div><div class="two-columns"><section class="panel"><div class="panel-title"><h2>Próximas sessões</h2><button data-page-link="appointments" class="text-button">Ver agenda →</button></div>${upcoming.length ? upcoming.map((a) => appointmentRow(a)).join('') : empty('Nenhuma sessão futura agendada.')}</section><section class="panel"><div class="panel-title"><h2>Orçamentos do mês</h2><span class="pill">${m.quotes} oportunidades</span></div><p class="hint">Status atual dos orçamentos criados no mês selecionado.</p><div class="pipeline">${statuses
      .map((status) => {
        const count = data.quotes.filter(
          (q) => localDate(q.created_at).startsWith(month) && q.status === status,
        ).length;
        return `<div><span>${escape(status)}</span><strong>${count}</strong><progress value="${count}" max="${Math.max(m.quotes, 1)}" aria-label="${escape(status)}"></progress></div>`;
      })
      .join(
        '',
      )}</div></section></div><section class="callout"><span class="callout-icon">↗</span><div><h2>Retornos que respeitam cada tratamento</h2><p>As sugestões aparecem após uma sessão realizada. Você revisa e confirma cada novo agendamento.</p></div><button class="secondary" data-page-link="appointments">Consultar retornos</button></section>`;
  }
  if (page === 'patients') {
    if (patientId) return patientDetail();
    const filtered = data.patients.filter((p) =>
      `${p.name} ${p.phone}`.toLowerCase().includes(search.toLowerCase()),
    );
    return `<div class="toolbar"><label class="search">Buscar paciente<input id="search" type="search" placeholder="Nome ou telefone" value="${escape(search)}"></label><button class="primary" data-edit="patients">+ Novo paciente</button></div><div class="panel table-wrap"><table><thead><tr><th>Paciente</th><th>Telefone</th><th>Procedimento principal</th><th>Ações</th></tr></thead><tbody>${filtered.map((p) => `<tr><td><button class="text-button patient-name" data-patient="${p.id}">${escape(p.name)}</button></td><td>${escape(p.phone)}</td><td>${escape(procedure(p.procedure_id)?.name)}</td><td>${action('Editar', 'patients', p.id)}</td></tr>`).join('')}</tbody></table>${!filtered.length ? empty('Nenhum paciente encontrado. Cadastre o primeiro paciente para começar.') : ''}</div>`;
  }
  if (page === 'appointments') {
    const list = data.appointments
      .filter((a) => localDate(a.starts_at).startsWith(month))
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const latest = new Map();
    for (const a of data.appointments
      .filter((a) => a.status === 'realizado')
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)))
      latest.set(`${a.patient_id}:${a.procedure_id}`, a);
    const returns = [...latest.values()].filter(
      (a) =>
        !data.appointments.some(
          (next) =>
            next.patient_id === a.patient_id &&
            next.procedure_id === a.procedure_id &&
            next.status === 'agendado' &&
            new Date(next.starts_at) > new Date(a.starts_at),
        ),
    );
    return `<div class="toolbar"><p class="hint">Agenda compartilhada · Uma sala de atendimento</p><button class="primary" data-edit="appointments">+ Agendar sessão</button></div><div class="panel"><div class="panel-title"><h2>Sessões do mês</h2><span class="pill">${list.length} sessões</span></div>${list.length ? list.map((a) => appointmentRow(a, true)).join('') : empty('Nenhuma sessão neste mês.')}</div><div class="panel returns"><div class="panel-title"><h2>Previsão de retornos</h2><span class="pill">Confirmação manual</span></div><p class="hint">Sugestões a partir da última sessão realizada, sem novo horário reservado. A avaliação clínica pode ajustar o intervalo.</p>${returns.length ? returns.map((a) => `<div class="appointment-row"><div><strong>${escape(patient(a.patient_id)?.name)}</strong><small>${escape(procedure(a.procedure_id)?.name)} · A partir de ${suggestedReturn(a.starts_at, procedure(a.procedure_id).interval_days).split('-').reverse().join('/')}</small></div><button class="secondary small" data-return="${a.id}">Revisar retorno</button></div>`).join('') : empty('Sem retornos pendentes de planejamento.')}</div>`;
  }
  if (page === 'quotes')
    return `<div class="toolbar"><p class="hint">Todas as oportunidades · Valores em reais</p><button class="primary" data-edit="quotes">+ Novo orçamento</button></div><div class="kanban">${statuses
      .map((status) => {
        const quotes = data.quotes.filter((q) => q.status === status);
        return `<section class="kanban-column"><h2>${escape(status)} <span>${quotes.length}</span></h2>${quotes.map((q) => `<article class="quote-card"><strong>${escape(patient(q.patient_id)?.name)}</strong><p>${escape(procedure(q.procedure_id)?.name)}</p><b>${money(q.amount_cents)}</b><small>${dateTime(q.created_at)}</small>${action('Atualizar orçamento', 'quotes', q.id)}</article>`).join('') || '<p class="hint">Nenhum orçamento</p>'}</section>`;
      })
      .join('')}</div>`;
  if (page === 'payments') {
    const m = monthlyMetrics(data, month);
    const pending = data.appointments.filter(
      (a) => a.status === 'realizado' && outstanding(data, a) > 0,
    );
    const list = data.payments
      .filter((p) => localDate(p.paid_at).startsWith(month))
      .sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at));
    return `<div class="metrics three">${[
      ['Recebido no mês', money(m.revenue)],
      ['Sessões realizadas no mês', money(m.billed)],
      [
        'Saldo a receber · todos os meses',
        money(pending.reduce((s, a) => s + outstanding(data, a), 0)),
      ],
    ]
      .map(
        ([name, value]) =>
          `<article class="metric"><span>${name}</span><strong>${value}</strong></article>`,
      )
      .join(
        '',
      )}</div><div class="panel"><div class="panel-title"><h2>Recebimentos</h2><button class="primary" data-edit="payments">+ Registrar pagamento</button></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Paciente</th><th>Forma</th><th>Valor</th></tr></thead><tbody>${list.map((p) => `<tr><td>${dateTime(p.paid_at)}</td><td>${escape(patient(data.appointments.find((a) => a.id === p.appointment_id)?.patient_id)?.name)}</td><td>${escape(p.method)}</td><td>${money(p.amount_cents)}</td></tr>`).join('')}</tbody></table></div>${!list.length ? empty('Nenhum pagamento registrado neste mês.') : ''}</div><div class="panel returns"><div class="panel-title"><h2>Sessões com saldo a receber</h2></div>${pending.map((a) => `<div class="appointment-row"><div><strong>${escape(patient(a.patient_id)?.name)}</strong><small>${dateTime(a.starts_at)} · ${escape(procedure(a.procedure_id)?.name)}</small></div><strong>${money(outstanding(data, a))}</strong></div>`).join('') || empty('Nenhum saldo pendente.')}</div>`;
  }
  if (page === 'procedures')
    return `<div class="panel"><div class="panel-title"><h2>Intervalos entre sessões</h2></div><p class="hint">Ajuste a sugestão de retorno. Nenhuma alteração cria agendamentos.</p>${data.procedures.map((p) => `<div class="appointment-row"><div><strong>${escape(p.name)}</strong><small>Retorno sugerido a partir de ${p.interval_days} dias</small></div>${action('Configurar', 'procedures', p.id)}</div>`).join('')}</div><section class="callout"><div><h2>WhatsApp Business Platform</h2><p>Estrutura de integração documentada. Nenhum envio automático está ativo nesta versão.</p></div></section>`;
  if (page === 'audit')
    return `<section class="panel"><div class="panel-title"><h2>Últimas 100 atividades</h2></div><p class="hint">A auditoria registra autor, ação e campos alterados, sem duplicar informações clínicas. Eventos de acesso são registrados pela API.</p><div class="table-wrap"><table><thead><tr><th>Quando</th><th>Autor (ID)</th><th>Ação</th><th>Recurso / campos</th></tr></thead><tbody>${data.audit_events.map((e) => `<tr><td>${dateTime(e.created_at)}</td><td class="mono">${escape(e.actor_id || 'Operação administrativa')}</td><td>${escape(e.action)}</td><td>${escape(e.entity)}<small>${escape((e.changed_fields || []).join(', '))}</small></td></tr>`).join('')}</tbody></table></div></section>`;
}
function appointmentRow(a, edit = false) {
  const date = new Date(a.starts_at);
  return `<div class="appointment-row"><div class="date-tile"><strong>${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date)}</strong><span>${new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' }).format(date)}</span></div><div class="appointment-info"><strong>${escape(patient(a.patient_id)?.name)}</strong><small>${escape(procedure(a.procedure_id)?.name)}</small><small>${dateTime(a.starts_at)} · ${a.duration_minutes} min · ${money(a.price_cents)}</small></div>${badge(a.status)}${edit ? action('Gerenciar', 'appointments', a.id) : ''}</div>`;
}
function patientDetail() {
  const p = patient(patientId);
  const notes = data.notes
    .filter((n) => n.patient_id === p.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return `<button class="text-button" id="back-patients">← Todos os pacientes</button><section class="panel patient-profile"><div class="panel-title"><div><h2>${escape(p.name)}</h2><p>${escape(p.phone)} · ${escape(procedure(p.procedure_id)?.name)}</p></div>${action('Editar cadastro', 'patients', p.id)}</div><h3>Histórico clínico</h3><p class="hint">Registre somente informações necessárias ao atendimento. Notas são preservadas; correções devem ser acrescentadas em uma nova nota.</p><button class="primary" data-edit="notes">+ Acrescentar nota</button>${notes.map((n) => `<article class="note"><small>${dateTime(n.created_at)} · Autor: ${escape(n.author_id || 'Demonstração')}</small><p>${escape(n.content)}</p></article>`).join('') || empty('Nenhuma anotação registrada.')}</section><section class="panel returns"><div class="panel-title"><h2>Sessões do paciente</h2></div>${
    data.appointments
      .filter((a) => a.patient_id === p.id)
      .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
      .map((a) => appointmentRow(a, true))
      .join('') || empty('Nenhuma sessão registrada.')
  }</section>`;
}
function bindContent() {
  root
    .querySelectorAll('[data-edit]')
    .forEach((b) => (b.onclick = () => openEditor(b.dataset.edit, b.dataset.id)));
  root.querySelectorAll('[data-page-link]').forEach(
    (b) =>
      (b.onclick = () => {
        page = b.dataset.pageLink;
        render();
      }),
  );
  root.querySelectorAll('[data-patient]').forEach(
    (b) =>
      (b.onclick = () => {
        patientId = b.dataset.patient;
        render();
      }),
  );
  root.querySelectorAll('[data-return]').forEach(
    (b) =>
      (b.onclick = () => {
        const a = data.appointments.find((x) => x.id === b.dataset.return);
        openEditor('appointments', null, {
          patient_id: a.patient_id,
          procedure_id: a.procedure_id,
          starts_at: `${suggestedReturn(a.starts_at, procedure(a.procedure_id).interval_days)}T09:00:00-03:00`,
          price_cents: a.price_cents,
        });
      }),
  );
  document.querySelector('#back-patients')?.addEventListener('click', () => {
    patientId = null;
    render();
  });
  document.querySelector('#search')?.addEventListener('input', (event) => {
    search = event.target.value;
    const pos = event.target.selectionStart;
    document.querySelector('#page-content').innerHTML = content();
    bindContent();
    const input = document.querySelector('#search');
    input.focus();
    input.setSelectionRange(pos, pos);
  });
}
function openEditor(entity, id, defaults = {}) {
  const submissionId = crypto.randomUUID();
  if (['appointments', 'quotes', 'notes'].includes(entity) && !data.patients.length)
    return notify('Cadastre um paciente primeiro.', true);
  const existing = id ? data[entity].find((x) => x.id === id) : null;
  const record = existing || defaults;
  const input = (name, label, type = 'text', value = record[name] ?? '', attrs = '') =>
    `<label>${label}<input name="${name}" type="${type}" value="${escape(value)}" ${attrs} required></label>`;
  const select = (name, label, options, value = record[name]) =>
    `<label>${label}<select name="${name}" required>${options.map(([key, label]) => `<option value="${escape(key)}" ${key === value ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select></label>`;
  const patientSelect = () =>
    select(
      'patient_id',
      'Paciente',
      data.patients.map((p) => [p.id, p.name]),
    );
  const procedureSelect = () =>
    select(
      'procedure_id',
      'Procedimento',
      data.procedures.map((p) => [p.id, p.name]),
    );
  const timestamp = (value) => {
    const d = new Date(value || Date.now());
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .format(d)
      .replace(' ', 'T');
  };
  let fields = '';
  if (entity === 'patients')
    fields =
      input(
        'name',
        'Nome completo',
        'text',
        record.name,
        'minlength="2" maxlength="120" autocomplete="off"',
      ) +
      input(
        'phone',
        'Telefone com DDD (somente números)',
        'tel',
        record.phone,
        'pattern="[0-9]{10,13}" maxlength="13" autocomplete="off"',
      ) +
      procedureSelect();
  if (entity === 'notes')
    fields = `<label>Nova anotação<textarea name="content" rows="6" maxlength="4000" required></textarea></label>`;
  if (entity === 'appointments')
    fields =
      patientSelect() +
      procedureSelect() +
      input(
        'starts_at',
        'Data e horário · Brasília',
        'datetime-local',
        timestamp(record.starts_at),
      ) +
      input(
        'duration_minutes',
        'Duração (minutos)',
        'number',
        record.duration_minutes ?? 30,
        'min="5" max="240" step="1"',
      ) +
      input(
        'price',
        'Valor da sessão (R$)',
        'number',
        (record.price_cents ?? 0) / 100,
        'min="0" max="1000000" step="0.01"',
      ) +
      select(
        'status',
        'Situação',
        ['agendado', 'cancelado', 'realizado'].map((s) => [s, s]),
        record.status || 'agendado',
      ) +
      '<p class="hint">Reagende alterando data e horário. Para cancelar, selecione “cancelado”. Só marque “realizado” após o atendimento. Salvar confirma sua escolha.</p>';
  if (entity === 'quotes')
    fields =
      patientSelect() +
      procedureSelect() +
      input(
        'amount',
        'Valor do orçamento (R$)',
        'number',
        (record.amount_cents ?? 0) / 100,
        'min="0" max="1000000" step="0.01"',
      ) +
      select(
        'status',
        'Status',
        statuses.map((s) => [s, s]),
        record.status || 'novo',
      );
  if (entity === 'payments') {
    const pending = data.appointments.filter(
      (a) => a.status === 'realizado' && outstanding(data, a) > 0,
    );
    if (!pending.length) return notify('Não há sessões realizadas com saldo a receber.', true);
    fields =
      select(
        'appointment_id',
        'Sessão',
        pending.map((a) => [
          a.id,
          `${patient(a.patient_id)?.name} · ${dateTime(a.starts_at)} · Saldo ${money(outstanding(data, a))}`,
        ]),
      ) +
      input('amount', 'Valor recebido (R$)', 'number', '', 'min="0.01" max="1000000" step="0.01"') +
      input('paid_at', 'Data do recebimento · Brasília', 'datetime-local', timestamp()) +
      select(
        'method',
        'Forma de pagamento',
        ['pix', 'dinheiro', 'cartão', 'transferência'].map((s) => [s, s]),
      );
  }
  if (entity === 'procedures')
    fields =
      `<p>${escape(record.name)}</p>` +
      input(
        'interval_days',
        'Intervalo sugerido (dias)',
        'number',
        record.interval_days,
        'min="1" max="730" step="1"',
      );
  const labels = {
    patients: 'paciente',
    notes: 'anotação',
    appointments: 'sessão',
    quotes: 'orçamento',
    payments: 'pagamento',
    procedures: 'intervalo',
  };
  dialog.innerHTML = `<form id="edit-form"><div class="panel-title"><h2 id="dialog-title">${id ? 'Editar' : 'Registrar'} ${labels[entity]}</h2><button type="button" id="close-dialog" class="text-button" aria-label="Fechar">✕</button></div>${fields}<p class="form-error" id="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary" id="cancel-dialog">Cancelar</button><button class="primary" id="save">${entity === 'appointments' ? 'Confirmar e salvar' : 'Salvar'}</button></div></form>`;
  dialog.querySelector('#close-dialog').onclick = () => dialog.close();
  dialog.querySelector('#cancel-dialog').onclick = () => dialog.close();
  dialog.showModal();
  dialog.querySelector('form').onsubmit = async (event) => {
    event.preventDefault();
    const button = dialog.querySelector('#save');
    button.disabled = true;
    const values = Object.fromEntries(new FormData(event.target));
    if (entity === 'payments') values.idempotency_key = submissionId;
    if (entity === 'notes') values.patient_id = patientId;
    if ('price' in values) {
      values.price_cents = Math.round(Number(values.price) * 100);
      delete values.price;
    }
    if ('amount' in values) {
      values.amount_cents = Math.round(Number(values.amount) * 100);
      delete values.amount;
    }
    for (const key of ['duration_minutes', 'interval_days'])
      if (key in values) values[key] = Number(values[key]);
    for (const key of ['starts_at', 'paid_at'])
      if (key in values) values[key] = new Date(`${values[key]}:00-03:00`).toISOString();
    try {
      if (demo) saveDemo(entity, id, values);
      else {
        await api(`${entity}${id ? `/${id}` : ''}`, id ? 'PATCH' : 'POST', {
          ...values,
          ...(id ? { version: record.version } : {}),
        });
      }
      // Close after a confirmed mutation even if the following read fails: do not invite duplicate receipts.
      dialog.close();
      notify('Registro salvo.');
      if (!demo) {
        try {
          data = await api('data');
        } catch (error) {
          notify(
            `Salvo, mas não foi possível atualizar a tela: ${error.message} Recarregue antes de continuar.`,
            true,
          );
          if (!data) return;
        }
      }
      render();
    } catch (error) {
      const box = dialog.querySelector('#form-error');
      if (box && dialog.open) box.textContent = error.message;
      else notify(error.message, true);
    } finally {
      button.disabled = false;
    }
  };
}
function saveDemo(entity, id, values) {
  if (entity === 'appointments') {
    const start = Date.parse(values.starts_at),
      end = start + values.duration_minutes * 60000;
    if (
      values.status !== 'cancelado' &&
      data.appointments.some(
        (a) =>
          a.id !== id &&
          a.status !== 'cancelado' &&
          start < Date.parse(a.starts_at) + a.duration_minutes * 60000 &&
          end > Date.parse(a.starts_at),
      )
    )
      throw new Error('Este horário está ocupado.');
    const paid = data.payments
      .filter((p) => p.appointment_id === id)
      .reduce((s, p) => s + p.amount_cents, 0);
    const old = data.appointments.find((a) => a.id === id);
    if (
      paid &&
      (values.status !== 'realizado' ||
        values.price_cents < paid ||
        values.patient_id !== old.patient_id ||
        values.procedure_id !== old.procedure_id ||
        Date.parse(values.starts_at) !== Date.parse(old.starts_at))
    )
      throw new Error('Sessão com recebimento não pode ser cancelada, movida ou transferida.');
  }
  if (entity === 'payments') {
    const a = data.appointments.find((a) => a.id === values.appointment_id);
    if (data.payments.some((p) => p.idempotency_key === values.idempotency_key))
      throw new Error('Pagamento já registrado.');
    if (!a || a.status !== 'realizado' || values.amount_cents > outstanding(data, a))
      throw new Error('Valor excede o saldo da sessão.');
  }
  if (id)
    Object.assign(
      data[entity].find((x) => x.id === id),
      values,
      { version: crypto.randomUUID() },
    );
  else
    data[entity].push({
      ...values,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      version: crypto.randomUUID(),
    });
  data.audit_events.unshift({
    id: crypto.randomUUID(),
    actor_id: 'Administrador de demonstração',
    action: id ? 'update' : 'insert',
    entity,
    changed_fields: id ? Object.keys(values) : [],
    created_at: new Date().toISOString(),
  });
}
// Never cache clinical data in localStorage, IndexedDB or a service worker.
let lastActivity = Date.now();
for (const event of ['pointerdown', 'keydown'])
  document.addEventListener(
    event,
    () => {
      lastActivity = Date.now();
    },
    { passive: true },
  );
setInterval(async () => {
  if (!demo && data && Date.now() - lastActivity > 15 * 60 * 1000) {
    clearWorkspace();
    await api('logout', 'POST', {}).catch(() => {});
    notify('Sessão bloqueada após 15 minutos de inatividade.');
  }
}, 15000);
try {
  await api('session');
  data = await api('data');
  render();
} catch {
  login();
}
