import { HttpError, validate, uuid, schemas } from './validation.js';
const accessCookie = '__Host-mml_access';
const refreshCookie = '__Host-mml_refresh';
const tables = [
  'patients',
  'procedures',
  'notes',
  'appointments',
  'quotes',
  'payments',
  'audit_events',
];
function cookie(request, name) {
  return (
    (request.headers.get('cookie') || '')
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ''
  );
}
function response(body, status = 200, session) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  if (session !== undefined) {
    for (const [name, value, age] of [
      [accessCookie, session?.access_token || '', session ? session.expires_in : 0],
      [refreshCookie, session?.refresh_token || '', session ? 28800 : 0],
    ]) {
      headers.append(
        'Set-Cookie',
        `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`,
      );
    }
  }
  return new Response(JSON.stringify(body), { status, headers });
}
async function readJson(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new HttpError(415, 'Use JSON.');
  // Bounded stream: never buffer an unbounded request, even without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Corpo obrigatório.');
  const decoder = new TextDecoder();
  let body = '';
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16000) {
      await reader.cancel();
      throw new HttpError(413, 'Conteúdo muito grande.');
    }
    body += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(body + decoder.decode());
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}
export async function handleRequest(request, env, fetcher = fetch) {
  try {
    const url = new URL(request.url);
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.APP_ORIGIN)
      throw new HttpError(503, 'Ambiente ainda não configurado.');
    if (url.origin !== env.APP_ORIGIN) throw new HttpError(403, 'Host não autorizado.');
    if (!['GET', 'POST', 'PATCH'].includes(request.method))
      throw new HttpError(405, 'Método não permitido.');
    if (request.method !== 'GET' && request.headers.get('origin') !== env.APP_ORIGIN)
      throw new HttpError(403, 'Origem não autorizada.');
    const path = url.pathname.replace(/^\/api\/?/, '');
    const sb = async (route, { method = 'GET', body, token, prefer, range } = {}) => {
      const headers = { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (prefer) headers.Prefer = prefer;
      if (range) headers.Range = range;
      const result = await fetcher(`${env.SUPABASE_URL.replace(/\/$/, '')}${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (!result.ok) {
        const code = (await result.json().catch(() => ({}))).code;
        if (result.status === 429)
          throw new HttpError(429, 'Muitas tentativas. Aguarde antes de tentar novamente.');
        if (result.status === 401) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
        if (code === '23P01' || code === '23505')
          throw new HttpError(409, 'Conflito: horário ocupado ou registro duplicado.');
        if (code === '23514' || code === '23503' || code === 'P0001')
          throw new HttpError(
            400,
            'Operação incompatível com os dados atuais. Verifique valores e sessão.',
          );
        throw new HttpError(502, 'Não foi possível concluir a operação.');
      }
      return result.status === 204 ? null : result.json();
    };
    const authorize = async (token) => {
      if (!token) throw new HttpError(401, 'Entre para continuar.');
      const user = await sb('/auth/v1/user', { token });
      if (!uuid(user.id)) throw new HttpError(401, 'Sessão inválida.');
      const admins = await sb(
        `/rest/v1/admins?user_id=eq.${user.id}&active=eq.true&select=user_id`,
        { token },
      );
      if (!admins.length)
        throw new HttpError(403, 'Acesso restrito aos administradores autorizados.');
      return user;
    };
    const log = (token, action) =>
      sb('/rest/v1/rpc/log_activity', { method: 'POST', token, body: { event_action: action } });
    if ((path === 'login' || path === 'refresh') && request.method === 'POST') {
      const input = await readJson(request);
      let body;
      if (path === 'login') {
        if (
          typeof input?.email !== 'string' ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
          input.email.length > 254 ||
          typeof input.password !== 'string' ||
          input.password.length < 8 ||
          input.password.length > 256
        )
          throw new HttpError(400, 'Confira e-mail e senha.');
        body = { email: input.email.trim(), password: input.password };
      } else {
        const token = cookie(request, refreshCookie);
        if (!token) throw new HttpError(401, 'Entre novamente.');
        body = { refresh_token: token };
      }
      let session;
      try {
        session = await sb(
          `/auth/v1/token?grant_type=${path === 'login' ? 'password' : 'refresh_token'}`,
          { method: 'POST', body },
        );
      } catch (error) {
        if (error.status === 429) throw error;
        throw new HttpError(
          401,
          'Não foi possível autenticar. Confira seus dados ou entre novamente.',
        );
      }
      const user = await authorize(session.access_token);
      await log(session.access_token, path);
      return response({ user: { email: user.email } }, 200, session);
    }
    const token = cookie(request, accessCookie);
    // Logout clears browser cookies even if the upstream session already expired.
    if (path === 'logout' && request.method === 'POST') {
      await readJson(request);
      let revoked = false;
      let logoutToken = token;
      try {
        if (logoutToken) {
          try {
            await sb('/auth/v1/user', { token: logoutToken });
          } catch {
            logoutToken = '';
          }
        }
        const refreshToken = cookie(request, refreshCookie);
        if (!logoutToken && refreshToken) {
          const session = await sb('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            body: { refresh_token: refreshToken },
          });
          logoutToken = session.access_token;
        }
        if (logoutToken) {
          // An audit outage or removed admin permission must not prevent Auth
          // revocation. The RPC independently enforces its admin policy.
          await log(logoutToken, 'logout').catch(() => {});
          await sb('/auth/v1/logout?scope=local', { method: 'POST', token: logoutToken });
          revoked = true;
        }
      } catch {
        /* no tokens or personal data in logs */
      }
      return response({ ok: true, revoked }, 200, null);
    }
    const user = await authorize(token);
    if (path === 'session' && request.method === 'GET')
      return response({ user: { email: user.email } });
    if (path === 'data' && request.method === 'GET') {
      await log(token, 'view_workspace');
      const entries = await Promise.all(
        tables.map(async (table) => {
          if (table === 'audit_events')
            return [
              table,
              await sb('/rest/v1/audit_events?select=*&order=created_at.desc&limit=100', { token }),
            ];
          const records = [];
          // Supabase defaults to 1,000 rows. Explicit pagination avoids silently incorrect totals.
          for (let offset = 0; ; offset += 500) {
            const page = await sb(
              `/rest/v1/${table}?select=*&order=id&offset=${offset}&limit=500`,
              { token },
            );
            records.push(...page);
            if (page.length < 500) break;
            if (records.length >= 50000)
              throw new HttpError(
                503,
                'Volume excede a versão inicial. Configure paginação por período antes de continuar.',
              );
          }
          return [table, records];
        }),
      );
      return response({ ...Object.fromEntries(entries), user: { email: user.email } });
    }
    const [entity, id, extra] = path.split('/');
    if (!Object.hasOwn(schemas, entity) || extra)
      throw new HttpError(404, 'Recurso não encontrado.');
    if (!['POST', 'PATCH'].includes(request.method))
      throw new HttpError(405, 'Método não permitido.');
    if (request.method === 'POST' && (id || entity === 'procedures'))
      throw new HttpError(405, 'Operação não permitida.');
    if (request.method === 'PATCH' && (!uuid(id) || ['notes', 'payments'].includes(entity)))
      throw new HttpError(405, 'Operação não permitida.');
    const input = await readJson(request);
    const version = input?.version;
    const values = { ...input };
    delete values.version;
    if (request.method === 'PATCH' && !uuid(version))
      throw new HttpError(400, 'Versão do registro obrigatória.');
    const clean = validate(entity, values);
    const result = await sb(`/rest/v1/${entity}${id ? `?id=eq.${id}&version=eq.${version}` : ''}`, {
      method: request.method,
      token,
      body: clean,
      prefer: 'return=representation',
    });
    if (id && !result.length)
      throw new HttpError(
        409,
        'O registro foi alterado por outro administrador. Atualize e tente novamente.',
      );
    return response(result[0], id ? 200 : 201);
  } catch (error) {
    return response(
      {
        error:
          error instanceof HttpError ? error.message : 'Serviço indisponível. Tente novamente.',
      },
      error instanceof HttpError ? error.status : 500,
    );
  }
}
