import test from 'node:test';
import assert from 'node:assert/strict';
import { treatments, whatsappLink } from '../site-public/whatsapp.js';
test('CTAs preservam telefone e mensagem específica sem dados clínicos', () => {
  assert.equal(treatments.length, 3);
  for (const t of treatments) {
    const url = new URL(whatsappLink(t.message));
    assert.equal(url.hostname, 'wa.me');
    assert.equal(url.pathname, '/5513997505099');
    assert.equal(url.searchParams.get('text'), t.message);
    assert.match(t.message, /Santos/);
  }
});
