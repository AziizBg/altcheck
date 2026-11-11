const COLORS = { VIABLE: 32, RISKY: 33, AVOID: 31, UNKNOWN: 90 };

export function fmtStars(n) {
  if (n == null) return '';
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

export function fmtDays(d) {
  if (d == null) return '?';
  if (d < 1) return 'today';
  if (d < 60) return `${d}d ago`;
  if (d < 730) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

export function renderTable(results, { color = false } = {}) {
  const paint = (v, s) => (color ? `\x1b[${COLORS[v] || 0}m${s}\x1b[0m` : s);
  const repoW = Math.max(4, ...results.map((r) => r.repo.length));
  const lines = [];
  for (const r of results) {
    const cols = [
      paint(r.verdict, r.verdict.padEnd(7)),
      r.repo.padEnd(repoW),
      `★ ${fmtStars(r.stars)}`.padEnd(8),
      String(r.license ?? '-').padEnd(14),
      `pushed ${fmtDays(r.pushedDaysAgo)}`.padEnd(16),
      r.busFactor != null ? `bus ${r.busFactor}` : '',
    ];
    lines.push(cols.join('  ').trimEnd());
    for (const f of r.flags || []) {
      if (f.level === 'info' && r.verdict !== 'VIABLE') continue;
      lines.push(`${' '.repeat(9)}↳ ${f.text}`);
    }
  }
  return lines.join('\n');
}
