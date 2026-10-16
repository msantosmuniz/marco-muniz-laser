export class SessionChangedError extends Error {
  constructor() {
    super('Sessão encerrada. Entre novamente.');
  }
}

// Each workspace has a generation. Responses from an old session must never
// repopulate the UI, including when fetch has already received response headers.
export function createApiClient({ fetcher = fetch, onSessionEnd = () => {} } = {}) {
  let generation = 0;
  let refreshPromise;
  let ending;
  const authRequests = new Set();
  const assertCurrent = (expected) => {
    if (expected !== generation) throw new SessionChangedError();
  };
  const raw = (path, method, body) => {
    const operation = (async () => {
      const result = await fetcher(`/api/${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
      });
      return { status: result.status, ok: result.ok, payload: await result.json() };
    })();
    if (['login', 'refresh'].includes(path)) {
      authRequests.add(operation);
      const remove = () => authRequests.delete(operation);
      operation.then(remove, remove);
    }
    return operation;
  };

  function endSession() {
    if (ending) return ending;
    generation++;
    const pendingAuth = [...authRequests];
    // Let token-producing responses finish before clearing cookies. Aborting a
    // read alone cannot guarantee that its Set-Cookie headers were not applied.
    ending = (async () => {
      await Promise.allSettled(pendingAuth);
      try {
        const result = await raw('logout', 'POST', {});
        return { revoked: result.ok && result.payload.revoked === true };
      } catch {
        return { revoked: false };
      } finally {
        ending = undefined;
      }
    })();
    onSessionEnd();
    return ending;
  }

  async function request(path, method = 'GET', body) {
    if (ending) throw new Error('Aguarde o encerramento da sessão antes de entrar novamente.');
    const expected = generation;
    let result;
    try {
      result = await raw(path, method, body);
    } catch (error) {
      assertCurrent(expected);
      throw error;
    }
    assertCurrent(expected);
    if (result.status === 401 && !['login', 'refresh', 'logout'].includes(path)) {
      refreshPromise ||= raw('refresh', 'POST', {}).finally(() => {
        refreshPromise = undefined;
      });
      try {
        const refreshed = await refreshPromise;
        assertCurrent(expected);
        if (!refreshed.ok) throw new Error('Não foi possível renovar a sessão.');
        result = await raw(path, method, body);
      } catch (error) {
        assertCurrent(expected);
        void endSession();
        throw new SessionChangedError();
      }
      assertCurrent(expected);
    }
    if ([401, 403].includes(result.status) && !['login', 'refresh', 'logout'].includes(path)) {
      void endSession();
      throw new SessionChangedError();
    }
    if (!result.ok) throw new Error(result.payload.error || 'Não foi possível concluir.');
    return result.payload;
  }
  return { request, endSession };
}
