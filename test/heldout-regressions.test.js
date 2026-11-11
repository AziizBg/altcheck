// Regression tests built from failures found by the first held-out benchmark (2026-11-10).
// All descriptions and texts are real, copied from GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claimsAlternativeTo, isNoiseRepo, windingDownPhrase, createClient } from '../src/github.js';
import { sniffLicense, classifyLicense, judge } from '../src/verdict.js';
import { loadSeed } from '../src/core.js';

test('search filter: real false positives from the held-out run are rejected', () => {
  const rejects = [
    ['zoom', 'Context Encoding for Semantic Segmentation  MegaDepth: Learning Single-View Depth  Zoom and Learn: Generalizing Deep Stereo Matching to Novel Domains  EPINET: A Fully-Convolutional Neural Network  SGAN: An Alternative Training of Generative Adversarial Networks'],
    ['linear', '📈 The fastest (for very small maps!) alternative of Rust HashMap, which doesn\'t use hashing and doesn\'t use heap (aka "linear map")'],
    ['discord', 'Tiny alternative Discord client with a smaller footprint, snappier startup, themes, plugins and more!'],
    ['discord', 'An alternative Discord client with voice support made with C++ and GTK 3'],
    ['discord', "Open-source alternative of Discord desktop's app.asar"],
    ['chatgpt', '开源 AI CRM，Salesforce 开源替代 + ChatGPT 式 AI 助手：客户管理、知识库查询、任务执行，全程对话完成。Open-source AI CRM and Salesforce alternative powered by conversational AI.'],
  ];
  for (const [tool, d] of rejects) assert.equal(claimsAlternativeTo(d, tool), false, `${tool}: ${d.slice(0, 60)}`);
});

test('search filter: real true positives still pass', () => {
  const accepts = [
    ['hotjar', '🚀 Open-source alternative for Mixpanel - Amplitude - Hotjar - Fullstory✨'],
    ['linear', 'Huly — All-in-One Project Management Platform (alternative to Linear, Jira, Slack, Notion, Motion)'],
    ['discord', 'A private, p2p alternative to Slack and Discord built on Tor & IPFS'],
    ['loom', 'Open source Loom alternative. Beautiful, shareable screen recordings.'],
    ['dropbox', 'A dead-simple dropbox alternative using Git'],
    ['heroku', 'An open-source, self-hostable PaaS alternative to Vercel, Heroku & Netlify that lets you easily deploy static sites'],
    ['cal.com', 'Free to host calendar availability picker - open-source cal.com / calendly alternative'],
  ];
  for (const [tool, d] of accepts) assert.equal(claimsAlternativeTo(d, tool), true, `${tool}: ${d.slice(0, 60)}`);
});

test('noise repos: demos and showcases', () => {
  for (const n of ['showcase-books-search', 'nextjs-demo', 'example-app', 'saas-starter', 'heroku-free-alternatives']) assert.ok(isNoiseRepo(n), n);
  for (const n of ['typesense', 'cap', 'plane']) assert.ok(!isNoiseRepo(n), n);
});

test('README winding-down phrases (real Moment README line), without false alarms', () => {
  assert.match(windingDownPhrase('> ⚠️ Moment.js is a legacy project, now in **maintenance mode**. New features'), /legacy project|maintenance mode/);
  assert.equal(windingDownPhrase('This project is no longer maintained.'), 'no longer maintained');
  assert.equal(windingDownPhrase('The `foo()` API is deprecated, use `bar()`.'), null);
  assert.equal(windingDownPhrase('We run in maintenance windows on Sundays.'), null);
  const r = judge({ repo: 'm/m', archived: false, pushedAt: new Date().toISOString(), createdAt: '2011-01-01T00:00:00Z', license: 'MIT', contributors: [{ login: 'a', contributions: 1 }, { login: 'b', contributions: 1 }], weeklyCommits: Array(52).fill(1), windingDown: 'now in maintenance mode' });
  assert.equal(r.verdict, 'RISKY');
});

test('license phrasings that the held-out run missed', () => {
  for (const f of ['medusajs_medusa', 'timescale_timescaledb', 'dubinc_dub', 'meilisearch_meilisearch']) {
    const text = readFileSync(new URL(`./fixtures/licenses/${f}.txt`, import.meta.url), 'utf8');
    assert.equal(sniffLicense(text), 'open-core', f);
  }
});

test('licenses in a subfolder are not reported as "no license"', async () => {
  const routes = {
    '/repos/r/p/contents/': [200, [{ name: 'README.md', type: 'file' }, { name: 'licenses', type: 'dir' }]],
    '/repos/r/p/contributors': [200, []],
    '/repos/r/p/stats/participation': [200, { all: Array(52).fill(1) }],
    '/repos/r/p/license': [404, {}],
    '/repos/r/p/readme': [404, {}],
    '/repos/r/p': [200, { full_name: 'r/p', license: null, archived: false, pushed_at: '2026-11-01T00:00:00Z', created_at: '2020-01-01T00:00:00Z' }],
  };
  const fetchImpl = async (url) => {
    const path = url.replace('https://api.github.com', '');
    const hit = Object.entries(routes).find(([p]) => path.startsWith(p));
    const [status, body] = hit ? hit[1] : [404, {}];
    return { status, ok: status < 300, json: async () => body };
  };
  const facts = await createClient({ fetchImpl }).repoFacts('r/p');
  assert.equal(facts.license, 'see:licenses/');
  assert.equal(classifyLicense(facts.license), 'unclear');
  const v = judge(facts);
  assert.ok(v.flags.some((f) => /but licenses\/ exists: read it/.test(f.text)));
  assert.ok(!v.flags.some((f) => /no right to use/.test(f.text)));
});

test('seed overrides: no container-only repos', () => {
  const repos = Object.values(loadSeed()).flat().map((x) => x.repo);
  assert.ok(repos.includes('taigaio/taiga-back'));
  assert.ok(!repos.some((r) => /taiga-docker|fusionauth-containers/.test(r)));
});
