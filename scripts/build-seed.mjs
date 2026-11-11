// Regenerate data/seed.json from a snapshot of the RunaCapital list (MIT licensed),
// then apply data/seed-overrides.json (wrong repos fixed, non-OSS entries removed).
// Usage: node scripts/build-seed.mjs [path-to-README.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRunaReadme, indexByTool } from '../src/seed.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const src = process.argv[2] || here('./runa-README.snapshot.md');
const overrides = JSON.parse(readFileSync(here('../data/seed-overrides.json'), 'utf8'));

let rows = parseRunaReadme(readFileSync(src, 'utf8'));
rows = rows
  .filter((r) => !(r.repo in overrides.remove))
  .map((r) => (overrides.replace[r.repo] ? { ...r, repo: overrides.replace[r.repo].repo } : r));

const index = indexByTool(rows);
writeFileSync(
  here('../data/seed.json'),
  JSON.stringify({ source: 'https://github.com/RunaCapital/awesome-oss-alternatives (MIT) + data/seed-overrides.json', rows: rows.length, index }, null, 1) + '\n',
);
console.log(`seed: ${rows.length} projects, ${Object.keys(index).length} proprietary tools`);
