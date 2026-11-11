// Pure scoring: turn raw repo facts into VIABLE / RISKY / AVOID plus reasons.

const DAY = 86_400_000;

// Common OSI-approved SPDX ids (GitHub's detector vocabulary).
const OSI = new Set([
  'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'BSD-3-Clause-Clear', 'ISC', '0BSD', 'Zlib',
  'GPL-2.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later',
  'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later',
  'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later', 'MPL-2.0', 'EPL-1.0', 'EPL-2.0', 'EUPL-1.1', 'EUPL-1.2',
  'Artistic-2.0', 'BSL-1.0', 'CDDL-1.0', 'MS-PL', 'MS-RL', 'OSL-3.0', 'ECL-2.0', 'NCSA', 'PostgreSQL',
  'Unlicense', 'UPL-1.0', 'MulanPSL-2.0', 'CECILL-2.1', 'BlueOak-1.0.0',
]);
// Source-available licenses often marketed as "open source". (BSL-1.0 above is Boost, not BUSL.)
const SOURCE_AVAILABLE = new Set(['BUSL-1.1', 'SSPL-1.0', 'Elastic-2.0', 'FSL-1.0', 'FSL-1.1-MIT', 'FSL-1.1-ALv2', 'Commons-Clause', 'PolyForm-Noncommercial-1.0.0', 'PolyForm-Shield-1.0.0', 'CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'FSL-1.1', 'PolyForm', 'Sustainable-Use-1.0', 'FCL-1.0']);

// GitHub reports many source-available licenses as NOASSERTION; recognise them from the text.
const SNIFF = [
  [/Business Source License/i, 'BUSL-1.1'],
  [/Server Side Public License/i, 'SSPL-1.0'],
  [/Functional Source License/i, 'FSL-1.1'],
  [/Elastic License 2\.0|Elastic License, Version 2/i, 'Elastic-2.0'],
  [/Commons Clause/i, 'Commons-Clause'],
  [/PolyForm (Noncommercial|Shield|Strict|Small Business|Internal Use)/i, 'PolyForm'],
  [/Sustainable Use License/i, 'Sustainable-Use-1.0'],
  [/Fair Core License/i, 'FCL-1.0'],
];
// OSI licenses as they are named in prose, most specific first.
const OSI_PROSE = [
  [/GNU Affero General Public License|\bAGPL/i, 'AGPL-3.0'],
  [/GNU (Lesser|Library) General Public License|\bLGPL/i, 'LGPL'],
  [/GNU General Public License|\bGPL(v?[23])?\b/i, 'GPL'],
  [/Apache License/i, 'Apache-2.0'],
  [/\bMIT\b/, 'MIT'],
  [/\bBSD\b/, 'BSD'],
  [/Mozilla Public License|\bMPL\b/i, 'MPL-2.0'],
];
const CHOICE = /your choice of|at your option|triple[- ]licen|dual[- ]licen|tri[- ]licen|one of (two|three) ways/i;
const OPEN_CORE =
  /Portions of this software|["'`]?(\.?ee|enterprise)\/?["'`]? (directory|folder|directories)|Except for the Enterprise Edition|Enterprise Edition \(EE\)|variously licensed under/i;

/**
 * Identify a license GitHub reported as NOASSERTION, from its text. Order matters:
 *  1. "choose AGPL or SSPL or ..."     -> multi:<OSI option>  (Redis 8, Elasticsearch, Mattermost)
 *  2. OSI core + proprietary part      -> open-core        (Chatwoot, Metabase, Medusa, Meilisearch, Timescale)
 *     only if an OSI license is named: n8n's open-core text names only Sustainable Use, so it falls to 3
 *  3. a named source-available license -> e.g. BUSL-1.1
 */
export function sniffLicense(text) {
  if (!text) return null;
  const head = text.slice(0, 4000);
  const osiOption = OSI_PROSE.find(([re]) => re.test(head));
  // GPL boilerplate "(at your option) any later version" is a version choice, not a choice between licenses.
  const choiceText = head.replace(/\(?at your option\)?\s*any later version/gi, "");
  if (CHOICE.test(choiceText) && osiOption) return `multi:${osiOption[1]}`;
  if (OPEN_CORE.test(head) && osiOption) return 'open-core';
  for (const [re, id] of SNIFF) if (re.test(head)) return id;
  return null;
}

export function classifyLicense(spdx) {
  if (!spdx || spdx === 'NONE') return 'none';
  if (String(spdx).startsWith('see:')) return 'unclear';
  if (OSI.has(spdx)) return 'osi';
  if (spdx === 'open-core') return 'open-core';
  if (String(spdx).startsWith('multi:')) return 'multi-osi';
  if (SOURCE_AVAILABLE.has(spdx)) return 'source-available';
  return 'unclear'; // NOASSERTION / "Other": GitHub could not identify it
}

/** Minimum number of humans whose commits cover half the (top-100) commits. */
export function busFactor(contributors) {
  const humans = (contributors || [])
    .filter((c) => c.type !== 'Bot' && !/\[bot\]$|^dependabot|^renovate/i.test(c.login || ''))
    .map((c) => c.contributions || 0)
    .sort((a, b) => b - a);
  const total = humans.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let acc = 0;
  for (let i = 0; i < humans.length; i++) {
    acc += humans[i];
    if (acc * 2 >= total) return i + 1;
  }
  return humans.length;
}

/**
 * facts: { repo, stars, archived, pushedAt, createdAt, license, contributors, weeklyCommits (array|null),
 *          licenseChangedAt (iso|null) }
 */
export function judge(facts, now = Date.now()) {
  const flags = []; // {level: 'avoid'|'risky'|'info', text}
  const ageDays = (iso) => (iso ? Math.floor((now - Date.parse(iso)) / DAY) : null);

  const pushedDays = ageDays(facts.pushedAt);
  const createdDays = ageDays(facts.createdAt);
  const recent12w = Array.isArray(facts.weeklyCommits)
    ? facts.weeklyCommits.slice(-12).reduce((a, b) => a + b, 0)
    : Number.isInteger(facts.commits12w) ? facts.commits12w : null;
  const bus = busFactor(facts.contributors);
  const licenseClass = classifyLicense(facts.license);

  if (facts.archived) flags.push({ level: 'avoid', text: 'repository is archived' });

  if (pushedDays != null && pushedDays > 365) flags.push({ level: 'avoid', text: `abandoned: last push ${pushedDays} days ago` });
  else if (recent12w === 0) flags.push({ level: 'risky', text: 'no commits on the default branch in the last 12 weeks' });
  else if (pushedDays != null && pushedDays > 180) flags.push({ level: 'risky', text: `stale: last push ${pushedDays} days ago` });
  if (facts.windingDown && !facts.archived) flags.push({ level: 'risky', text: `README says "${facts.windingDown}"` });

  if (licenseClass === 'source-available') flags.push({ level: 'risky', text: `source-available license (${facts.license}), not OSI open source` });
  else if (licenseClass === 'multi-osi') flags.push({ level: 'info', text: `multi-licensed: you can pick ${facts.license.slice(6)} (OSI); the other options are source-available or commercial` });
  else if (licenseClass === 'open-core') flags.push({ level: 'info', text: 'open-core: OSS core, but a proprietary directory (enterprise/ or ee/) holds paid features' });
  else if (licenseClass === 'none') flags.push({ level: 'risky', text: 'no license file: you have no right to use or fork it' });
  else if (String(facts.license).startsWith('see:')) flags.push({ level: 'risky', text: `no license GitHub can identify at the root, but ${facts.license.slice(4)} exists: read it before adopting` });
  else if (licenseClass === 'unclear') flags.push({ level: 'risky', text: `license not recognised (${facts.license}): read it before adopting` });

  const licenseChangedDays = ageDays(facts.licenseChangedAt);
  if (licenseChangedDays != null && licenseChangedDays < 730 && createdDays != null && createdDays - licenseChangedDays > 730) {
    flags.push({
      level: ['osi', 'open-core', 'multi-osi'].includes(licenseClass) ? 'info' : 'risky',
      text: `LICENSE file changed ${licenseChangedDays} days ago on a ${Math.round(createdDays / 365)}-year-old repo: check for relicensing`,
    });
  }

  if (bus === 1) flags.push({ level: createdDays != null && createdDays < 180 ? 'risky' : 'info', text: 'bus factor 1: one person wrote most of it' });
  if (createdDays != null && createdDays < 180) flags.push({ level: 'risky', text: `young project (${createdDays} days old): unproven` });

  const verdict = flags.some((f) => f.level === 'avoid') ? 'AVOID' : flags.some((f) => f.level === 'risky') ? 'RISKY' : 'VIABLE';
  return {
    repo: facts.repo,
    verdict,
    stars: facts.stars ?? null,
    license: facts.license || null,
    licenseClass,
    pushedDaysAgo: pushedDays,
    commitsLast12Weeks: recent12w,
    busFactor: bus,
    ageDays: createdDays,
    flags,
  };
}

const ORDER = { VIABLE: 0, RISKY: 1, AVOID: 2, UNKNOWN: 3 };
export function sortResults(results) {
  return [...results].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || (b.stars || 0) - (a.stars || 0));
}
