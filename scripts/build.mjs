import { mkdir, cp, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'dist'), { recursive: true });
for (const entry of await readdir(resolve(root, 'public')))
  await cp(resolve(root, 'public', entry), resolve(root, 'dist', entry), { recursive: true });
console.log(
  'Intranet pronta em dist/. As Pages Functions permanecem em functions/. Nenhum deploy executado.',
);
