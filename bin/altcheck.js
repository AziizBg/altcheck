#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createClient, resolveToken } from '../src/github.js';
import { findAlternatives, vetRepo, isRepoSlug } from '../src/core.js';
import { renderTable } from '../src/format.js';
import { serve } from '../src/mcp.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const HELP = `altcheck ${version}: open-source alternatives, without the abandonware

  altcheck <tool>              find OSS alternatives to <tool> and vet each live
  altcheck vet <owner/repo>    vet one repo
  altcheck --mcp               run as an MCP server (stdio)

  --limit N    candidates to vet (default 10, or 5 without a token)
  --json       machine-readable output
  --no-live    seed list only, skip GitHub search

Auth: uses GITHUB_TOKEN, GH_TOKEN or \`gh auth token\` if available.
Without one GitHub allows ~60 requests/hour (about 2 lookups).`;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, def) => {
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const positional = argv.filter((a, i) => !a.startsWith('-') && argv[i - 1] !== '--limit');

if (flag('--version') || flag('-v')) {
  console.log(version);
} else if (flag('--mcp')) {
  serve(createClient({ token: resolveToken() }), version);
} else if (flag('--help') || flag('-h') || positional.length === 0) {
  console.log(HELP);
  process.exit(positional.length === 0 && !flag('--help') && !flag('-h') ? 1 : 0);
} else {
  const token = resolveToken();
  const client = createClient({ token });
  // Unauthenticated: 60 requests/hour and ~5 per candidate, so keep the default small.
  const defaultLimit = token ? 10 : 5;
  try {
    const color = process.stdout.isTTY && !process.env.NO_COLOR;
    if (positional[0] === 'vet') {
      const repo = positional[1];
      if (!isRepoSlug(repo)) throw new Error('usage: altcheck vet owner/repo');
      const r = await vetRepo(client, repo);
      console.log(flag('--json') ? JSON.stringify(r, null, 2) : renderTable([r], { color }));
    } else {
      if (!token && !flag('--json') && !argv.some((a) => a.startsWith('--limit'))) {
        console.error('altcheck: no GitHub token, so checking 5 candidates (~2 lookups/hour). Set GITHUB_TOKEN or run `gh auth login` for more.\n');
      }
      const tool = positional.join(' ');
      const limit = Number(opt('--limit', defaultLimit)) || defaultLimit;
      const out = await findAlternatives(client, tool, { limit, live: !flag('--no-live') });
      if (flag('--json')) console.log(JSON.stringify(out, null, 2));
      else if (!out.results.length) console.log(`No open-source alternatives found for "${tool}".`);
      else {
        const counts = out.results.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] || 0) + 1), a), {});
        console.log(`Alternatives to ${tool}: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}\n`);
        console.log(renderTable(out.results, { color }));
      }
    }
  } catch (err) {
    console.error(`altcheck: ${err.message}`);
    process.exit(2);
  }
}
