import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findAlternatives } from '../src/core.js';
import { createHandler } from '../src/mcp.js';

const NOW = Date.parse('2026-11-10T00:00:00Z');
const BIN = fileURLToPath(new URL('../bin/altcheck.js', import.meta.url));

function fact(repo, extra = {}) {
  return {
    repo, description: '', stars: 100, archived: false,
    pushedAt: '2026-11-01T00:00:00Z', createdAt: '2018-01-01T00:00:00Z', license: 'MIT',
    contributors: [{ login: 'a', contributions: 5 }, { login: 'b', contributions: 5 }],
    weeklyCommits: Array(52).fill(1), licenseChangedAt: null, ...extra,
  };
}

function fakeClient({ search = [], repos = {}, redirects = {} } = {}) {
  return {
    searchAlternatives: async () => search,
    repoFacts: async (repo) => {
      const target = redirects[repo] || repo;
      if (repos[target] instanceof Error) throw repos[target];
      return repos[target] || null;
    },
  };
}

const seed = {
  notion: [
    { name: 'Focalboard', repo: 'mattermost/focalboard', description: '' },
    { name: 'Old', repo: 'old/thing', description: '' },
  ],
};

test('findAlternatives merges seed and live search, dedupes moved repos, sorts by verdict', async () => {
  const client = fakeClient({
    search: [
      { name: 'focalboard', repo: 'mattermost-community/focalboard', description: '' },
      { name: 'AppFlowy', repo: 'AppFlowy-IO/AppFlowy', description: '' },
    ],
    redirects: { 'mattermost/focalboard': 'mattermost-community/focalboard' },
    repos: {
      'mattermost-community/focalboard': fact('mattermost-community/focalboard', { license: 'NOASSERTION' }),
      'old/thing': fact('old/thing', { archived: true }),
      'AppFlowy-IO/AppFlowy': fact('AppFlowy-IO/AppFlowy', { stars: 79000, license: 'AGPL-3.0' }),
    },
  });
  const out = await findAlternatives(client, 'Notion', { seed, now: NOW });
  assert.deepEqual(
    out.results.map((r) => [r.repo, r.verdict]),
    [['AppFlowy-IO/AppFlowy', 'VIABLE'], ['mattermost-community/focalboard', 'RISKY'], ['old/thing', 'AVOID']],
  );
  assert.equal(out.results.find((r) => r.repo === 'old/thing').source, 'seed');
});

test('findAlternatives marks per-repo failures UNKNOWN but propagates rate limits', async () => {
  const boom = new Error('GitHub 500');
  const out = await findAlternatives(fakeClient({ repos: { 'old/thing': boom } }), 'notion', { seed, live: false, now: NOW });
  assert.ok(out.results.every((r) => r.verdict === 'UNKNOWN'));

  const limited = Object.assign(new Error('GitHub rate limit hit'), { code: 'RATE_LIMIT' });
  await assert.rejects(findAlternatives(fakeClient({ repos: { 'old/thing': limited } }), 'notion', { seed, live: false }), /rate limit/);
});

test('MCP handler: initialize, tools/list, tools/call, errors', async () => {
  const handle = createHandler(fakeClient({ repos: { 'a/b': fact('a/b') } }), '9.9.9');
  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(init.result.serverInfo.name, 'altcheck');
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);

  const list = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map((t) => t.name), ['find_alternatives', 'vet_repo']);

  const call = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'vet_repo', arguments: { repo: 'a/b' } } });
  assert.equal(JSON.parse(call.result.content[0].text).verdict, 'VIABLE');

  const bad = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'vet_repo', arguments: { repo: '../etc' } } });
  assert.equal(bad.result.isError, true);

  const unknown = await handle({ jsonrpc: '2.0', id: 5, method: 'nope' });
  assert.equal(unknown.error.code, -32601);
});

test('bin --mcp speaks newline-delimited JSON-RPC over stdio', async () => {
  const child = spawn(process.execPath, [BIN, '--mcp'], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, GITHUB_TOKEN: 'x' } });
  const lines = [];
  let buf = '';
  const got = new Promise((resolve) => {
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        lines.push(JSON.parse(buf.slice(0, i)));
        buf = buf.slice(i + 1);
        if (lines.length === 2) resolve();
      }
    });
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  await got;
  child.kill();
  assert.equal(lines[0].id, 1);
  assert.equal(lines[1].result.tools.length, 2);
});

test('live search results take priority over the stale seed when the limit is tight', async () => {
  const client = fakeClient({
    search: [{ name: 'Big', repo: 'big/new', description: '' }],
    repos: { 'big/new': fact('big/new', { stars: 50000 }), 'mattermost/focalboard': fact('mattermost/focalboard') },
  });
  const out = await findAlternatives(client, 'notion', { seed, limit: 1, now: NOW });
  assert.deepEqual(out.results.map((r) => r.repo), ['big/new']);
});

test('bin --version prints the version and exits 0', () => {
  const r = spawnSync(process.execPath, [BIN, '--version'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('bin --help exits 0, no args exits 1', () => {
  const help = spawnSync(process.execPath, [BIN, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /without the abandonware/);
  assert.equal(spawnSync(process.execPath, [BIN], { encoding: 'utf8' }).status, 1);
});
