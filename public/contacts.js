// Only the contact explicitly selected by the user is returned. No persistence or requests.
export function supportsContactPicker(nav = navigator, win = window) {
  return Boolean(win.isSecureContext && win.top === win.self && nav.contacts?.select);
}

export async function pickContact(nav = navigator, win = window) {
  if (!supportsContactPicker(nav, win))
    throw new Error(
      'Este navegador não abre os contatos do celular. Copie o nome e o telefone da sua agenda e preencha abaixo.',
    );
  let contacts;
  try {
    // Call directly from the click handler: the picker requires transient user activation.
    contacts = await nav.contacts.select(['name', 'tel'], { multiple: false });
  } catch (error) {
    if (error.name === 'AbortError') return null;
    throw new Error(
      'Não foi possível abrir os contatos. Você pode preencher nome e telefone manualmente.',
    );
  }
  const contact = contacts?.[0];
  if (!contact) return null;
  return {
    name: (contact.name?.find((name) => typeof name === 'string' && name.trim()) || '')
      .trim()
      .slice(0, 120),
    phones: [
      ...new Set(
        (contact.tel || [])
          .filter((phone) => typeof phone === 'string')
          .map((phone) => phone.replace(/\D/g, ''))
          .filter((phone) => /^\d{10,13}$/.test(phone)),
      ),
    ],
  };
}
