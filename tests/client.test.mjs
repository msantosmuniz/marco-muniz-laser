import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, SessionChangedError } from '../public/api-client.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('resposta atrasada não repõe dados após sair ou bloquear a tela', async () => {
  const pending = deferred();
  let visible = { patients: ['Fictício'] };
  const client = createApiClient({
    onSessionEnd: () => { visible = undefined; },
    fetcher: (url) => url.endsWith('/logout') ? json({ revoked: true }) : pending.promise,
  });
  const read = client.request('data').then((data) => { visible = data; });
  const rejected = assert.rejects(read, SessionChangedError);
  const closing = client.endSession();
  assert.equal(visible, undefined);
  pending.resolve(json({ patients: ['Resposta antiga'] }));
  await rejected;
  await closing;
  assert.equal(visible, undefined);
});

test('logout aguarda refresh pendente e bloqueia novo login enquanto encerra', async () => {
  const refresh = deferred();
  const calls = [];
  const client = createApiClient({ fetcher: (url) => {
    calls.push(url);
    if (url.endsWith('/refresh')) return refresh.promise;
    if (url.endsWith('/logout')) return json({ revoked: true });
    return json({}, 401);
  } });
  const read = client.request('data');
  const rejected = assert.rejects(read, SessionChangedError);
  await tick();
  const closing = client.endSession();
  await assert.rejects(client.request('login', 'POST', {}), /Aguarde/);
  assert.deepEqual(calls, ['/api/data', '/api/refresh']);
  refresh.resolve(json({ user: {} }));
  await rejected;
  assert.deepEqual(await closing, { revoked: true });
  assert.deepEqual(calls, ['/api/data', '/api/refresh', '/api/logout']);
});

test('uma falha antiga não encerra uma nova sessão', async () => {
  const old = deferred();
  let clears = 0;
  let reads = 0;
  const client = createApiClient({
    onSessionEnd: () => { clears++; },
    fetcher: (url) => {
      if (url.endsWith('/logout')) return json({ revoked: true });
      if (url.endsWith('/login')) return json({ user: {} });
      return ++reads === 1 ? old.promise : json({ patients: ['Nova sessão'] });
    },
  });
  const rejected = assert.rejects(client.request('data'), SessionChangedError);
  await client.endSession();
  await client.request('login', 'POST', {});
  old.resolve(json({}, 401));
  await rejected;
  assert.equal(clears, 1);
  assert.deepEqual(await client.request('data'), { patients: ['Nova sessão'] });
});

test('negação de autorização remove o conteúdo privado da tela', async () => {
  let cleared = false;
  const client = createApiClient({
    onSessionEnd: () => { cleared = true; },
    fetcher: (url) => url.endsWith('/logout') ? json({ revoked: true }) : json({}, 403),
  });
  await assert.rejects(client.request('data'), SessionChangedError);
  assert.equal(cleared, true);
  await tick();
});

test('falha de rede no logout bloqueia a tela imediatamente e informa revogação incerta', async () => {
  let cleared = false;
  const client = createApiClient({
    onSessionEnd: () => { cleared = true; },
    fetcher: async () => { throw new Error('offline'); },
  });
  const closing = client.endSession();
  assert.equal(cleared, true);
  assert.deepEqual(await closing, { revoked: false });
});

test('requisições concorrentes compartilham uma única renovação', async () => {
  const refresh = deferred();
  let refreshes = 0;
  let refreshed = false;
  const client = createApiClient({ fetcher: (url) => {
    if (url.endsWith('/refresh')) { refreshes++; return refresh.promise; }
    return refreshed ? json({ ok: true }) : json({}, 401);
  } });
  const first = client.request('data');
  const second = client.request('session');
  await tick();
  assert.equal(refreshes, 1);
  refreshed = true;
  refresh.resolve(json({ user: {} }));
  assert.deepEqual(await Promise.all([first, second]), [{ ok: true }, { ok: true }]);
});

test('corpo JSON atrasado também é descartado após bloqueio', async () => {
  const body = deferred();
  const client = createApiClient({ fetcher: (url) => url.endsWith('/logout')
    ? json({ revoked: true })
    : { status: 200, ok: true, json: () => body.promise },
  });
  const rejected = assert.rejects(client.request('data'), SessionChangedError);
  await tick();
  await client.endSession();
  body.resolve({ patients: ['Fictício'] });
  await rejected;
});
