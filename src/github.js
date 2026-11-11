// Minimal GitHub REST client. `fetchImpl` is injectable for tests.
import { execFileSync } from 'node:child_process';
import { sniffLicense } from './verdict.js';

export function resolveToken(env = process.env) {
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  if (env.GH_TOKEN) return env.GH_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim() || null;
  } catch {
    return null;
  }
}

// Product names that are also ordinary English words: only count them when written as a name ("Linear", not "linear map").
const COMMON_WORD_TOOLS = new Set([
  'linear', 'zoom', 'notion', 'slack', 'loom', 'front', 'box', 'monday', 'segment', 'mode', 'square',
  'buffer', 'drift', 'pitch', 'close', 'basecamp', 'harvest', 'gather', 'spark', 'bear', 'things', 'craft', 'arc', 'raycast',
]);
const ALT_WORD = /alternative|replacement/gi;
// "an alternative Discord client", "Discord desktop's app.asar": a different client for the same service, not an alternative to it.
const CLIENT_AFTER = /^(?:'s)?(?:\s+[\w'.-]+){0,2}?\s+(?:client|clients|app\.asar|mod|mods|theme|themes|plugin|plugins|bot|bots|wrapper|sdk|frontend|front-end|extension)\b/i;
const NEAR = 100; // max characters between "alternative" and the tool name

/**
 * True if `description` claims to be an alternative to `tool`: in the same sentence, within NEAR characters
 * of "alternative"/"replacement", not as "<tool> client", and with common-word names written as names.
 */
export function claimsAlternativeTo(description, tool) {
  if (!description || !tool) return false;
  const esc = tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sentences = description.split(/[.!?](?:\s|$)|[•|。！？\n]|\s{2,}/);
  const common = COMMON_WORD_TOOLS.has(tool.toLowerCase());
  for (const s of sentences) {
    const alts = [...s.matchAll(ALT_WORD)].map((m) => m.index);
    if (!alts.length) continue;
    for (const m of s.matchAll(new RegExp(`(?<![\\w])${esc}(?![\\w-])`, 'gi'))) {
      if (common && m[0] === m[0].toLowerCase()) continue;
      if (CLIENT_AFTER.test(s.slice(m.index + m[0].length))) continue;
      if (alts.some((a) => Math.abs(a - m.index) <= NEAR)) return true;
    }
  }
  return false;
}

/** Lists, demos and templates ("awesome-x", "free-heroku-alternatives", "showcase-books-search") are not alternatives. */
export function isNoiseRepo(name) {
  return /awesome|(^|[-_])alternatives?([-_]list)?$|^list[-_]of|showcase|demo|example|sample|tutorial|starter|template|boilerplate/i.test(name || '');
}
export const isListRepo = isNoiseRepo; // kept for compatibility

// A README that says the project is winding down.
const WINDING_DOWN =
  /\b(?:is|now)\s+in\s+maintenance[- ]mode\b|\bmaintenance[- ]mode\s+only\b|\bno longer (?:actively )?(?:maintained|developed|supported)\b|\b(?:this|the)\s+(?:project|repo(?:sitory)?|library|package|tool|app)\s+(?:is|has been)\s+(?:now\s+)?(?:deprecated|discontinued|abandoned|unmaintained|archived|sunset)\b|\blegacy project\b|\blooking for (?:a )?new maintainers?\b/i;
export function windingDownPhrase(text) {
  const plain = (text || '').slice(0, 6000).replace(/[*_`>#]/g, '').replace(/\s+/g, ' ');
  const m = plain.match(WINDING_DOWN);
  return m ? m[0] : null;
}

const FATAL = new Set(['RATE_LIMIT', 'AUTH', 'NETWORK']);
/** For optional sub-requests: tolerate odd failures, but never hide rate limits, bad auth or no network. */
function soft(err) {
  if (FATAL.has(err.code)) throw err;
  return { body: null };
}

export function createClient({ token = null, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  async function get(path) {
    let res;
    try {
      res = await fetchImpl(`https://api.github.com${path}`, {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'altcheck',
          'x-github-api-version': '2022-11-28',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch (cause) {
      throw Object.assign(new Error(`cannot reach api.github.com (${cause.cause?.code || cause.message})`), { code: 'NETWORK' });
    }
    if (res.status === 401) {
      throw Object.assign(new Error('GitHub rejected the token (401): check GITHUB_TOKEN / GH_TOKEN or run `gh auth login`'), { code: 'AUTH' });
    }
    if (res.status === 404) return { status: 404, body: null };
    if (res.status === 202) return { status: 202, body: null }; // stats still computing
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers?.get?.('x-ratelimit-reset'));
      const mins = reset ? Math.max(1, Math.ceil((reset * 1000 - now()) / 60000)) : null;
      const when = mins ? ` (resets in ${mins} min)` : '';
      const err = new Error(
        token
          ? `GitHub rate limit hit${when}`
          : `GitHub rate limit hit${when}: unauthenticated use allows ~60 requests/hour. Set GITHUB_TOKEN or run \`gh auth login\``,
      );
      err.code = 'RATE_LIMIT';
      throw err;
    }
    if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
    return { status: res.status, body: await res.json() };
  }

  /** Raw facts for one repo (owner/name). Returns null if it does not exist. */
  async function repoFacts(repo) {
    const meta = await get(`/repos/${repo}`);
    if (!meta.body) return null;
    const full = meta.body.full_name;
    const [contributors, participation, license, readme] = await Promise.all([
      get(`/repos/${full}/contributors?per_page=100`).catch(soft),
      get(`/repos/${full}/stats/participation`).catch(soft),
      get(`/repos/${full}/license`).catch(soft),
      get(`/repos/${full}/readme`).catch(soft),
    ]);
    let spdx = meta.body.license?.spdx_id ?? null;
    if ((!spdx || spdx === 'NOASSERTION' || spdx === 'OTHER') && license.body?.content) {
      spdx = sniffLicense(Buffer.from(license.body.content, 'base64').toString('utf8')) || spdx;
    }
    // No license GitHub can see at the root: look for a licenses/ folder or LICENSE-* files before saying "none".
    if (!spdx && !license.body) {
      const root = await get(`/repos/${full}/contents/`).catch(soft);
      const found = Array.isArray(root.body) ? root.body.find((e) => /^(licen[cs]es?|copying)/i.test(e.name)) : null;
      if (found) spdx = `see:${found.name}${found.type === 'dir' ? '/' : ''}`;
    }
    const readmeText = readme.body?.content ? Buffer.from(readme.body.content, 'base64').toString('utf8') : '';
    const windingDown = windingDownPhrase(`${meta.body.description || ''}\n${readmeText}`);
    // /stats/participation answers 202 ("still computing") for repos nobody queried recently.
    // Fall back to counting default-branch commits since 12 weeks ago (capped at 100).
    let commits12w = null;
    if (!Array.isArray(participation.body?.all)) {
      const since = new Date(now() - 84 * 86_400_000).toISOString();
      const recent = await get(`/repos/${full}/commits?since=${since}&per_page=100`).catch(soft);
      if (Array.isArray(recent.body)) commits12w = recent.body.length;
    }
    let licenseChangedAt = null;
    if (license.body?.path) {
      const commits = await get(`/repos/${full}/commits?path=${encodeURIComponent(license.body.path)}&per_page=1`).catch(soft);
      licenseChangedAt = commits.body?.[0]?.commit?.committer?.date ?? null;
    }
    return {
      repo: full,
      description: meta.body.description,
      stars: meta.body.stargazers_count,
      archived: meta.body.archived,
      pushedAt: meta.body.pushed_at,
      createdAt: meta.body.created_at,
      license: spdx,
      contributors: Array.isArray(contributors.body) ? contributors.body : [],
      weeklyCommits: participation.body?.all ?? null,
      commits12w,
      licenseChangedAt,
      windingDown,
    };
  }

  /** Live discovery: repos whose description calls them an alternative to `tool`. */
  async function searchAlternatives(tool, perPage = 10) {
    const q = `${tool} alternative in:description fork:false stars:>=100`;
    // Fetch 3x what we need (still one request): the filters below drop a lot.
    const { body } = await get(`/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=${Math.min(100, perPage * 3)}`);
    const owners = new Set();
    return (body?.items || [])
      .filter((r) => claimsAlternativeTo(r.description, tool))
      .filter((r) => !isNoiseRepo(r.name))
      .filter((r) => {
        // One repo per owner (the most-starred): drops "plane-mobile", "showcase-*" siblings.
        const o = r.owner?.login?.toLowerCase() ?? r.full_name.split('/')[0].toLowerCase();
        if (owners.has(o)) return false;
        owners.add(o);
        return true;
      })
      .slice(0, perPage)
      .map((r) => ({ name: r.name, repo: r.full_name, description: r.description }));
  }

  return { get, repoFacts, searchAlternatives };
}
