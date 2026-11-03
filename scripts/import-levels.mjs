import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodePersist } from './persist-codec.mjs';

const source = resolve(process.argv[2] ?? 'vendor/hammerfest');
await mkdir('public/assets/data', { recursive: true });
for (const name of ['adventure', 'tutorial']) {
  const encoded = (await readFile(`${source}/xml/levels/${name}.xml`, 'utf8')).trim();
  const raw = encoded.split(':').filter(Boolean).map(decodePersist);
  await writeFile(`public/assets/data/${name}.json`, JSON.stringify(raw));
  console.log(`${name}: decoded ${raw.length} levels; first level keys: ${Object.keys(raw[0]).join(', ')}`);
}
