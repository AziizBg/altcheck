// Score altcheck against bench/heldout.json (live GitHub; needs a token).
// Usage: node bench/run.mjs repos|tools [heldout.json|heldout-2.json]. Prints results; nothing is tuned.
import { readFileSync } from 'node:fs';
import { createClient, resolveToken } from '../src/github.js';
import { vetRepo, findAlternatives } from '../src/core.js';

const file = process.argv[3] || 'heldout.json';
const bench = JSON.parse(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'));
const client = createClient({ token: resolveToken() });
const mode = process.argv[2] || 'repos';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (mode === 'repos') {
  let lic = 0, stat = 0, dangerous = 0, safeMiss = 0;
  for (const { repo, truth } of bench.repos) {
    const v = await vetRepo(client, repo);
    const licOk = v.licenseClass === truth.license;
    // Openness ranking: a miss towards "less open" is cautious (safe); towards "more open" is dangerous.
    const OPEN = { none: 0, unclear: 0, 'source-available': 0, 'open-core': 1, 'multi-osi': 2, osi: 2 };
    const licSafeMiss = !licOk && OPEN[v.licenseClass] <= OPEN[truth.license];
    const stale = (v.flags || []).some((f) => /abandoned|stale|no commits/.test(f.text));
    const statOk =
      truth.status === 'abandoned' ? v.verdict === 'AVOID'
      : truth.status === 'maintenance' ? v.verdict !== 'VIABLE'
      : v.verdict !== 'AVOID' && !stale;
    const danger = v.verdict === 'VIABLE' && (truth.license === 'source-available' || truth.status === 'abandoned');
    lic += licOk; stat += statOk; dangerous += danger; safeMiss += licSafeMiss;
    console.log(
      `${licOk ? 'ok ' : licSafeMiss ? '~  ' : 'BAD'} ${statOk ? 'ok ' : 'BAD'} ${danger ? 'DANGER' : '      '} ${repo.padEnd(28)} ` +
        `truth=${truth.license}/${truth.status}  got=${v.licenseClass}(${v.license})/${v.verdict}  ${(v.flags || []).map((f) => f.text.slice(0, 50)).join(' ; ')}`,
    );
  }
  const n = bench.repos.length;
  console.log(`\nlicense class exact: ${lic}/${n} (+${safeMiss} safe misses reported as unclear/none)\nstatus: ${stat}/${n}\ndangerous VIABLE: ${dangerous}/${n}`);
} else {
  let hits = 0, rel = 0, tot = 0;
  for (const { tool, expectAny } of bench.tools) {
    const out = await findAlternatives(client, tool, { limit: 10 });
    const names = out.results.map((r) => r.repo.toLowerCase());
    const hit = expectAny.some((e) => names.some((n) => n.split('/')[1].includes(e) || n.split('/')[0].includes(e)));
    hits += hit;
    console.log(`\n## ${tool}  recall:${hit ? 'HIT' : 'MISS'}  (expected any of ${expectAny.join(', ')})`);
    for (const r of out.results) console.log(`   [ ] ${r.verdict.padEnd(7)} ${r.source.padEnd(13)} ${r.repo.padEnd(36)} ${(r.description || '').slice(0, 80)}`);
    tot += out.results.length;
    await sleep(2500);
  }
  console.log(`\nrecall (>=1 expected alternative found): ${hits}/${bench.tools.length}\ncandidates to judge by hand: ${tot}`);
}
