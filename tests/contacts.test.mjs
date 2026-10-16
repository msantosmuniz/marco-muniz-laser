import test from 'node:test';
import assert from 'node:assert/strict';
import { pickContact, supportsContactPicker } from '../public/contacts.js';

const win = { isSecureContext: true, top: 1, self: 1 };
test('contatos: somente nome/telefone de um contato, normalização e escolha entre números', async () => {
  let called = false;
  const promise = pickContact(
    {
      contacts: {
        select: (props, options) => {
          called = true;
          assert.deepEqual(props, ['name', 'tel']);
          assert.deepEqual(options, { multiple: false });
          return Promise.resolve([
            {
              name: [' Cliente Fictício '],
              tel: ['+55 (13) 90000-0000', '5513900000000', '(13) 90000-0001', '123'],
              email: ['discard@example.invalid'],
            },
          ]);
        },
      },
    },
    win,
  );
  assert.equal(called, true, 'select must run synchronously within the click gesture');
  assert.deepEqual(await promise, {
    name: 'Cliente Fictício',
    phones: ['5513900000000', '13900000001'],
  });
});
test('contatos: cancelamento, campos ausentes e falha não expõem dados do aparelho', async () => {
  const nav = (fn) => ({ contacts: { select: fn } });
  assert.equal(
    await pickContact(
      nav(() => []),
      win,
    ),
    null,
  );
  assert.equal(
    await pickContact(
      nav(() => {
        throw { name: 'AbortError' };
      }),
      win,
    ),
    null,
  );
  assert.deepEqual(
    await pickContact(
      nav(() => [{}]),
      win,
    ),
    { name: '', phones: [] },
  );
  await assert.rejects(
    pickContact(
      nav(() => {
        throw new Error('private');
      }),
      win,
    ),
    /preencher nome e telefone manualmente/,
  );
});
test('contatos: navegador incompatível, iframe e HTTP usam alternativa manual', async () => {
  assert.equal(supportsContactPicker({}, win), false);
  for (const context of [
    { ...win, isSecureContext: false },
    { ...win, top: 2 },
  ]) {
    const nav = { contacts: { select: () => assert.fail('must not call the picker') } };
    assert.equal(supportsContactPicker(nav, context), false);
    await assert.rejects(pickContact(nav, context), /Copie o nome e o telefone/);
  }
});
