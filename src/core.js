import { readFileSync } from 'node:fs';
import { normalizeTool } from './seed.js';
import { judge, sortResults } from './verdict.js';

let seedCache;
export function loadSeed() {
  seedCache ||= JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8')).index;
  return seedCache;
}

export function seedCandidates(tool, seed = loadSeed()) {
  return seed[normalizeTool(tool)] || [];
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export async function vetRepo(client, repo, now = Date.now()) {
  const facts = await client.repoFacts(repo);
  if (!facts) return { repo, verdict: 'UNKNOWN', flags: [{ level: 'avoid', text: 'repository not found' }] };
  return { ...judge(facts, now), description: facts.description };
}

/** Seed ∪ live GitHub search, deduped, each vetted. */
export async function findAlternatives(client, tool, { limit = 10, live = true, seed, now = Date.now() } = {}) {
  const fromSeed = seedCandidates(tool, seed).map((c) => ({ ...c, source: 'seed' }));
  let fromSearch = [];
  if (live) {
    fromSearch = (await client.searchAlternatives(tool, limit)).map((c) => ({ ...c, source: 'github-search' }));
  }
  const seen = new Set();
  const candidates = [];
  // Interleave live (star-sorted, current) with seed (curated, but a stale snapshot), live first,
  // so a tight limit keeps the best of both.
  const merged = [];
  for (let i = 0; i < Math.max(fromSearch.length, fromSeed.length); i++) {
    if (fromSearch[i]) merged.push(fromSearch[i]);
    if (fromSeed[i]) merged.push(fromSeed[i]);
  }
  for (const c of merged) {
    const key = c.repo.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(c);
  }
  const picked = candidates.slice(0, limit);
  const results = await mapLimit(picked, 4, async (c) => {
    try {
      return { name: c.name, source: c.source, ...(await vetRepo(client, c.repo, now)) };
    } catch (err) {
      if (['RATE_LIMIT', 'AUTH', 'NETWORK'].includes(err.code)) throw err;
      return { name: c.name, source: c.source, repo: c.repo, verdict: 'UNKNOWN', flags: [{ level: 'risky', text: err.message }] };
    }
  });
  // Seed entries can point at a repo that has since moved; dedupe on the resolved name.
  const resolved = new Set();
  const unique = results.filter((r) => {
    const key = r.repo.toLowerCase();
    if (resolved.has(key)) return false;
    resolved.add(key);
    return true;
  });
  return { tool, candidatesFound: candidates.length, results: sortResults(unique) };
}

/** owner/name with no dot-only segments (blocks "../x" path tricks). */
export function isRepoSlug(s) {
  return typeof s === 'string' && /^[\w.-]+\/[\w.-]+$/.test(s) && !s.split('/').some((p) => /^\.+$/.test(p));
}
