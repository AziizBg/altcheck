import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, busFactor, classifyLicense, sniffLicense, sortResults } from '../src/verdict.js';

const NOW = Date.parse('2026-11-10T00:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();
const healthy = {
  repo: 'acme/good',
  stars: 5000,
  archived: false,
  pushedAt: daysAgo(2),
  createdAt: daysAgo(2000),
  license: 'MIT',
  contributors: [
    { login: 'a', contributions: 40 },
    { login: 'b', contributions: 30 },
    { login: 'c', contributions: 30 },
  ],
  weeklyCommits: Array(52).fill(5),
  licenseChangedAt: daysAgo(1900),
};

test('healthy repo is VIABLE with no flags', () => {
  const r = judge(healthy, NOW);
  assert.equal(r.verdict, 'VIABLE');
  assert.deepEqual(r.flags, []);
  assert.equal(r.busFactor, 2);
  assert.equal(r.commitsLast12Weeks, 60);
});

test('archived is AVOID', () => {
  assert.equal(judge({ ...healthy, archived: true }, NOW).verdict, 'AVOID');
});

test('no push for over a year is AVOID (abandoned)', () => {
  const r = judge({ ...healthy, pushedAt: daysAgo(400), weeklyCommits: Array(52).fill(0) }, NOW);
  assert.equal(r.verdict, 'AVOID');
  assert.match(r.flags[0].text, /abandoned: last push 400 days ago/);
});

test('no commits in 12 weeks is RISKY', () => {
  const weekly = [...Array(40).fill(3), ...Array(12).fill(0)];
  const r = judge({ ...healthy, weeklyCommits: weekly }, NOW);
  assert.equal(r.verdict, 'RISKY');
  assert.match(r.flags[0].text, /no commits/);
});

test('commits12w fallback is used when weekly stats are missing', () => {
  const r = judge({ ...healthy, weeklyCommits: null, commits12w: 0 }, NOW);
  assert.equal(r.verdict, 'RISKY');
  assert.equal(r.commitsLast12Weeks, 0);
  assert.equal(judge({ ...healthy, weeklyCommits: null, commits12w: null }, NOW).commitsLast12Weeks, null);
});

test('source-available license is RISKY even when active', () => {
  const r = judge({ ...healthy, license: 'BUSL-1.1' }, NOW);
  assert.equal(r.verdict, 'RISKY');
  assert.match(r.flags[0].text, /source-available license \(BUSL-1\.1\)/);
});

test('missing and unrecognised licenses are RISKY', () => {
  assert.equal(judge({ ...healthy, license: null }, NOW).verdict, 'RISKY');
  assert.equal(judge({ ...healthy, license: 'NOASSERTION' }, NOW).verdict, 'RISKY');
});

test('open-core stays VIABLE with an info note', () => {
  const r = judge({ ...healthy, license: 'open-core' }, NOW);
  assert.equal(r.verdict, 'VIABLE');
  assert.equal(r.flags[0].level, 'info');
});

test('recent LICENSE change on an old repo: info if OSI, risky if not', () => {
  const changed = { ...healthy, licenseChangedAt: daysAgo(100) };
  const osi = judge(changed, NOW);
  assert.equal(osi.verdict, 'VIABLE');
  assert.match(osi.flags[0].text, /check for relicensing/);
  const busl = judge({ ...changed, license: 'BUSL-1.1' }, NOW);
  assert.ok(busl.flags.some((f) => f.level === 'risky' && /relicensing/.test(f.text)));
});

test('young single-maintainer project is RISKY', () => {
  const r = judge({ ...healthy, createdAt: daysAgo(60), licenseChangedAt: daysAgo(60), contributors: [{ login: 'solo', contributions: 300 }] }, NOW);
  assert.equal(r.verdict, 'RISKY');
  assert.ok(r.flags.some((f) => /young project \(60 days old\)/.test(f.text)));
  assert.ok(r.flags.some((f) => /bus factor 1/.test(f.text) && f.level === 'risky'));
});

test('old single-maintainer project only gets an info note', () => {
  const r = judge({ ...healthy, contributors: [{ login: 'solo', contributions: 300 }] }, NOW);
  assert.equal(r.verdict, 'VIABLE');
  assert.equal(r.flags[0].level, 'info');
});

test('busFactor ignores bots', () => {
  assert.equal(
    busFactor([
      { login: 'dependabot[bot]', contributions: 1000, type: 'Bot' },
      { login: 'renovate-bot', contributions: 900 },
      { login: 'a', contributions: 10 },
      { login: 'b', contributions: 10 },
    ]),
    1,
  );
  assert.equal(busFactor([]), null);
});

test('classifyLicense', () => {
  assert.equal(classifyLicense('Apache-2.0'), 'osi');
  assert.equal(classifyLicense('BSL-1.0'), 'osi'); // Boost, not BUSL
  assert.equal(classifyLicense('SSPL-1.0'), 'source-available');
  assert.equal(classifyLicense('NOASSERTION'), 'unclear');
  assert.equal(classifyLicense(null), 'none');
});

test('sniffLicense recognises source-available and open-core texts', () => {
  assert.equal(sniffLicense('Business Source License 1.1\n\nParameters\nLicensor: HashiCorp'), 'BUSL-1.1');
  assert.equal(sniffLicense('Server Side Public License\nVERSION 1'), 'SSPL-1.0');
  assert.equal(sniffLicense('# Sustainable Use License\nVersion 1.0'), 'Sustainable-Use-1.0');
  assert.equal(sniffLicense('Portions of this software are licensed as follows:\n* "enterprise/" directory ...\nthe rest under the MIT license'), 'open-core');
  assert.equal(sniffLicense('Portions of this software are licensed as follows: proprietary only'), null, 'open-core needs an OSI core');
  assert.equal(sniffLicense('available under your choice of the GNU Affero General Public License or SSPL'), 'multi:AGPL-3.0');
  assert.equal(sniffLicense('MIT License\nPermission is hereby granted'), null);
  assert.equal(sniffLicense(''), null);
});

test('sortResults: verdict first, then stars', () => {
  const sorted = sortResults([
    { repo: 'x', verdict: 'AVOID', stars: 9999 },
    { repo: 'y', verdict: 'VIABLE', stars: 10 },
    { repo: 'z', verdict: 'VIABLE', stars: 100 },
    { repo: 'w', verdict: 'RISKY', stars: 1 },
  ]);
  assert.deepEqual(sorted.map((r) => r.repo), ['z', 'y', 'w', 'x']);
});
