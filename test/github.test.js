import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, claimsAlternativeTo, isListRepo } from '../src/github.js';

test('claimsAlternativeTo needs "alternative" and the tool in the same sentence (real descriptions)', () => {
  const cases = [
    ['A lightweight alternative to OpenClaw that runs in containers for security. Connects to WhatsApp, Telegram, Slack', 'slack', false],
    ['Huly — All-in-One Project Management Platform (alternative to Linear, Jira, Slack, Notion, Motion)', 'slack', true],
    ['Open-source and local-first Slack and Notion alternative that puts you in control', 'slack', true],
    ['Lightweight, cookie-free Google Analytics alternative', 'google analytics', true],
    ['The Open Source DocuSign Alternative.', 'docusign', true],
    ['A notion-like editor, alternative to Word', 'notion', false],
    ['Self-hosted replacement for Dropbox', 'dropbox', true],
    [null, 'x', false],
  ];
  for (const [desc, tool, want] of cases) assert.equal(claimsAlternativeTo(desc, tool), want, `${tool}: ${desc}`);
});

test('isListRepo drops lists of alternatives', () => {
  for (const n of ['heroku-free-alternatives', 'free-heroku-alternatives', 'awesome-selfhosted', 'alternatives']) assert.ok(isListRepo(n), n);
  for (const n of ['plane', 'nocodb', 'alternativeto-clone']) assert.ok(!isListRepo(n), n);
});

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    const path = url.replace('https://api.github.com', '');
    calls.push({ path, init });
    for (const [prefix, [status, body]] of Object.entries(routes)) {
      if (path.startsWith(prefix)) return { status, ok: status < 300, json: async () => body };
    }
    return { status: 404, ok: false, json: async () => ({}) };
  };
  impl.calls = calls;
  return impl;
}

const b64 = (s) => Buffer.from(s).toString('base64');

test('repoFacts gathers meta, contributors, participation, license change date', async () => {
  const fetchImpl = fakeFetch({
    '/repos/outline/outline/contributors': [200, [{ login: 'tom', contributions: 900 }]],
    '/repos/outline/outline/stats/participation': [200, { all: Array(52).fill(4) }],
    '/repos/outline/outline/license': [200, { path: 'LICENSE', content: b64('Business Source License 1.1\nLicensor: General Outline') }],
    '/repos/outline/outline/commits?path=LICENSE': [200, [{ commit: { committer: { date: '2026-10-23T00:00:00Z' } } }]],
    '/repos/outline/outline': [200, { full_name: 'outline/outline', stargazers_count: 41000, archived: false, pushed_at: '2026-11-10T00:00:00Z', created_at: '2016-01-01T00:00:00Z', license: { spdx_id: 'NOASSERTION' }, description: 'wiki' }],
  });
  const client = createClient({ token: 't0ken', fetchImpl });
  const facts = await client.repoFacts('outline/outline');
  assert.equal(facts.license, 'BUSL-1.1', 'NOASSERTION is sniffed from the license text');
  assert.equal(facts.licenseChangedAt, '2026-10-23T00:00:00Z');
  assert.equal(facts.weeklyCommits.length, 52);
  assert.equal(facts.contributors[0].login, 'tom');
  assert.equal(fetchImpl.calls[0].init.headers.authorization, 'Bearer t0ken');
});

test('repoFacts falls back to counting commits when stats are still computing (202)', async () => {
  const fetchImpl = fakeFetch({
    '/repos/a/b/contributors': [200, []],
    '/repos/a/b/stats/participation': [202, {}],
    '/repos/a/b/license': [404, {}],
    '/repos/a/b/commits?since=2026-08-18': [200, [{}, {}, {}]],
    '/repos/a/b': [200, { full_name: 'a/b', stargazers_count: 1, archived: false, pushed_at: '2026-11-01T00:00:00Z', created_at: '2020-01-01T00:00:00Z', license: { spdx_id: 'MIT' } }],
  });
  const client = createClient({ fetchImpl, now: () => Date.parse('2026-11-10T00:00:00Z') });
  const facts = await client.repoFacts('a/b');
  assert.equal(facts.weeklyCommits, null);
  assert.equal(facts.commits12w, 3);
  assert.ok(fetchImpl.calls.some((c) => c.path.startsWith('/repos/a/b/commits?since=2026-08-18')));
});

test('a rate limit on a sub-request is not silently swallowed', async () => {
  const fetchImpl = fakeFetch({
    '/repos/a/b/contributors': [403, {}],
    '/repos/a/b/stats/participation': [200, { all: [] }],
    '/repos/a/b/license': [404, {}],
    '/repos/a/b': [200, { full_name: 'a/b', license: null }],
  });
  await assert.rejects(createClient({ fetchImpl }).repoFacts('a/b'), (e) => e.code === 'RATE_LIMIT');
});

test('rate limit message includes when it resets', async () => {
  const fetchImpl = async () => ({ status: 403, ok: false, headers: { get: (h) => (h === 'x-ratelimit-reset' ? String(Date.parse('2026-11-10T00:30:00Z') / 1000) : null) }, json: async () => ({}) });
  const client = createClient({ fetchImpl, now: () => Date.parse('2026-11-10T00:00:00Z') });
  await assert.rejects(client.repoFacts('a/b'), /rate limit hit \(resets in 30 min\): unauthenticated/);
});

test('bad token and no network give clear errors', async () => {
  await assert.rejects(createClient({ fetchImpl: fakeFetch({ '/repos/': [401, {}] }) }).repoFacts('a/b'), (e) => e.code === 'AUTH' && /rejected the token/.test(e.message));
  const offline = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
  await assert.rejects(createClient({ fetchImpl: offline }).repoFacts('a/b'), (e) => e.code === 'NETWORK' && /cannot reach api\.github\.com \(ENOTFOUND\)/.test(e.message));
});

test('repoFacts returns null for a missing repo', async () => {
  const client = createClient({ fetchImpl: fakeFetch({}) });
  assert.equal(await client.repoFacts('nope/nope'), null);
});

test('rate limit becomes a RATE_LIMIT error with a hint', async () => {
  const client = createClient({ fetchImpl: fakeFetch({ '/repos/': [403, {}] }) });
  await assert.rejects(client.repoFacts('a/b'), (err) => err.code === 'RATE_LIMIT' && /GITHUB_TOKEN/.test(err.message));
});

test('searchAlternatives keeps only repos that say they are an alternative to the tool', async () => {
  const client = createClient({
    fetchImpl: fakeFetch({
      '/search/repositories': [200, { items: [
        { name: 'appflowy', full_name: 'AppFlowy-IO/AppFlowy', description: 'Open-source alternative to Notion' },
        { name: 'notion-sdk', full_name: 'x/notion-sdk', description: 'Notion API client' },
        { name: 'awesome-notion', full_name: 'y/awesome-notion', description: 'Awesome Notion alternatives' },
        { name: 'notionary', full_name: 'z/notionary', description: 'An alternative to notional accounting' },
      ] }],
    }),
  });
  const found = await client.searchAlternatives('notion');
  assert.deepEqual(found.map((r) => r.repo), ['AppFlowy-IO/AppFlowy']);
});
