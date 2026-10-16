import { normalizePhone, normalizeName } from '../public/quotes.js';

// Pure, read-only staging adapter. Call only behind server authorization when a
// Google Sheets connector is added. Never automatically merge, write or send.
export function previewImport(rows, patients, links = [], sourceKey) {
  if (!sourceKey || sourceKey.length > 200 || !Array.isArray(rows) || rows.length > 1000)
    throw new Error('Fonte obrigatória; máximo de 1.000 linhas por prévia.');
  const seenIds = new Set(),
    seenPhones = new Set();
  return rows.map((row) => {
    const externalId = String(row.external_id ?? '').trim();
    const phone = normalizePhone(row.phone);
    const name = normalizeName(row.name);
    const result = { externalId, action: 'review', patientId: null };
    if (
      !externalId ||
      externalId.length > 200 ||
      !name ||
      name.length > 120 ||
      !/^\d{12,13}$/.test(phone)
    )
      return { ...result, reason: 'invalid_row' };
    if (seenIds.has(externalId) || seenPhones.has(phone))
      return { ...result, reason: 'duplicate_in_batch' };
    seenIds.add(externalId);
    seenPhones.add(phone);
    const bindings = links.filter(
      (l) => l.source_key === sourceKey && l.external_id === externalId,
    );
    if (bindings.length) return { ...result, action: 'skip', reason: 'already_imported' };
    const matches = patients.filter((p) => normalizePhone(p.phone) === phone);
    if (!matches.length) return { ...result, action: 'propose_new', reason: 'no_match' };
    if (matches.length === 1 && normalizeName(matches[0].name) === name)
      return {
        ...result,
        action: 'propose_link',
        patientId: matches[0].id,
        reason: 'exact_match',
      };
    return { ...result, reason: 'ambiguous_customer' };
  });
}
