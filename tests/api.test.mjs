import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../server/api.js';
const env = {
  SUPABASE_URL: 'https://project.example',
  SUPABASE_ANON_KEY: 'test-public-key',
  APP_ORIGIN: 'https://app.example',
};
const userId = '00000000-0000-4000-8000-000000000001';
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
function req(path, method = 'GET', body, headers = {}) {
  return new Request(`https://app.example/api/${path}`, {
    method,
    headers: {
      Origin: env.APP_ORIGIN,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const authMock = (url) =>
  url.endsWith('/auth/v1/user')
    ? json({ id: userId, email: 'admin@example.invalid' })
    : url.includes('/admins?')
      ? json([{ user_id: userId }])
      : json([]);
test('intake e acompanhamento exigem sessão e administrador', async () => {
  for (const path of ['quote-intake', 'quote_contacts']) {
    assert.equal((await handleRequest(req(path, 'POST', {}), env, authMock)).status, 401);
    assert.equal(
      (
        await handleRequest(
          req(path, 'POST', {}, { cookie: '__Host-mml_access=test' }),
          env,
          async (url) => (url.endsWith('/user') ? json({ id: userId }) : json([])),
        )
      ).status,
      403,
    );
  }
});
test('intake usa RPC atômica sob JWT do administrador, sem token na resposta', async () => {
  const input = {
    patient_id: userId,
    procedure_id: userId,
    amount_cents: 25000,
    session_price_cents: 25000,
    description: 'Exemplo',
    quote_date: '2026-10-16',
    status: 'aguardando',
    intake_key: userId,
  };
  let writes = 0;
  const r = await handleRequest(
    req('quote-intake', 'POST', input, { cookie: '__Host-mml_access=test' }),
    env,
    async (url, opts) => {
      if (url.endsWith('/rpc/create_quote_intake')) {
        writes++;
        assert.equal(opts.headers.Authorization, 'Bearer test');
        assert.deepEqual(JSON.parse(opts.body), { payload: input });
        return json({ id: userId, ...input });
      }
      return authMock(url);
    },
  );
  assert.equal(r.status, 201);
  assert.equal(writes, 1);
  assert.equal(r.headers.get('cache-control'), 'no-store, private');
  assert.ok(!(await r.text()).includes('Bearer'));
});
test('não é possível alterar autor ou apagar histórico de contatos pela API', async () => {
  for (const [method, body, suffix, status] of [
    ['PATCH', { quote_id: userId, stage: 7, version: userId }, `/${userId}`, 405],
    ['DELETE', undefined, `/${userId}`, 405],
    ['POST', { quote_id: userId, stage: 7, actor_id: userId }, '', 400],
  ]) {
    const r = await handleRequest(
      req(`quote_contacts${suffix}`, method, body, {
        cookie: '__Host-mml_access=test',
      }),
      env,
      authMock,
    );
    assert.equal(r.status, status);
  }
});
test('configuração ausente falha fechada', async () =>
  assert.equal((await handleRequest(req('data'), {})).status, 503));
test('sem sessão, nenhuma chamada ao banco', async () => {
  let calls = 0;
  const r = await handleRequest(req('data'), env, async () => {
    calls++;
    return json({});
  });
  assert.equal(r.status, 401);
  assert.equal(calls, 0);
});
test('origem externa é bloqueada antes do login', async () =>
  assert.equal(
    (await handleRequest(req('login', 'POST', {}, { Origin: 'https://evil.example' }), env)).status,
    403,
  ));
test('usuário autenticado sem autorização administrativa não lê dados', async () => {
  const r = await handleRequest(
    req('data', 'GET', null, { cookie: '__Host-mml_access=test' }),
    env,
    async (url) => (url.endsWith('/user') ? json({ id: userId }) : json([])),
  );
  assert.equal(r.status, 403);
});
test('login usa cookies seguros sem retornar tokens no corpo', async () => {
  const r = await handleRequest(
    req('login', 'POST', {
      email: 'admin@example.invalid',
      password: 'fictional-password',
    }),
    env,
    async (url) =>
      url.includes('/token?')
        ? json({
            access_token: 'secret-access',
            refresh_token: 'secret-refresh',
            expires_in: 900,
          })
        : authMock(url),
  );
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
  assert.doesNotMatch(await r.text(), /secret-access|secret-refresh/);
  assert.equal(r.headers.get('cache-control'), 'no-store, private');
});
test('refresh renova ambos cookies e verifica administrador', async () => {
  const r = await handleRequest(
    req('refresh', 'POST', {}, { cookie: '__Host-mml_refresh=old' }),
    env,
    async (url, opts) => {
      if (url.includes('grant_type=refresh_token')) {
        assert.deepEqual(JSON.parse(opts.body), { refresh_token: 'old' });
        return json({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 900,
        });
      }
      return authMock(url);
    },
  );
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /new-refresh/);
});
test('proteção contra atualização perdida retorna conflito', async () => {
  const r = await handleRequest(
    req(
      `procedures/${userId}`,
      'PATCH',
      { interval_days: 31, version: userId },
      { cookie: '__Host-mml_access=test' },
    ),
    env,
    async (url) => authMock(url),
  );
  assert.equal(r.status, 409);
});
test('campos inválidos são rejeitados no servidor', async () => {
  const r = await handleRequest(
    req(
      'patients',
      'POST',
      {
        name: 'Fictício',
        phone: '13000000000',
        procedure_id: userId,
        created_at: 'forged',
      },
      { cookie: '__Host-mml_access=test' },
    ),
    env,
    async (url) => authMock(url),
  );
  assert.equal(r.status, 400);
});
test('payload excessivo é rejeitado antes de chegar ao Supabase', async () => {
  const r = await handleRequest(req('login', 'POST', { email: 'a'.repeat(17000) }), env);
  assert.equal(r.status, 413);
});
test('logout sempre apaga cookies locais mesmo com JWT expirado', async () => {
  const r = await handleRequest(req('logout', 'POST', {}), env);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
});

test('logout renova JWT expirado somente para revogar a sessão remota', async () => {
  const calls = [];
  const r = await handleRequest(
    req('logout', 'POST', {}, { cookie: '__Host-mml_access=expired; __Host-mml_refresh=refresh' }),
    env,
    async (url, opts) => {
      calls.push(url);
      if (url.endsWith('/user')) return json({}, 401);
      if (url.includes('/token?')) {
        assert.deepEqual(JSON.parse(opts.body), { refresh_token: 'refresh' });
        return json({ access_token: 'renewed' });
      }
      assert.equal(opts.headers.Authorization, 'Bearer renewed');
      return new Response(null, { status: 204 });
    },
  );
  assert.deepEqual(await r.json(), { ok: true, revoked: true });
  assert.ok(calls.some((url) => url.endsWith('/logout?scope=local')));
  assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
  assert.doesNotMatch(r.headers.get('set-cookie'), /renewed/);
});

test('falha de auditoria ou acesso administrativo revogado não bloqueia logout no Auth', async () => {
  let revoked = false;
  const r = await handleRequest(
    req('logout', 'POST', {}, { cookie: '__Host-mml_access=valid' }),
    env,
    async (url) => {
      if (url.endsWith('/user')) return json({ id: userId });
      if (url.includes('/rpc/')) return json({}, 403);
      assert.ok(url.endsWith('/logout?scope=local'));
      revoked = true;
      return new Response(null, { status: 204 });
    },
  );
  assert.equal(revoked, true);
  assert.deepEqual(await r.json(), { ok: true, revoked: true });
});
