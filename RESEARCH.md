# Open-source alternatives portal: research, verdict, pitch

Date: 2026-11-10. Question: is there room for a portal where people find open-source (and AI-era) alternatives to the tools they use or are about to buy, and can it go "deeper and bigger" than a directory?

## TL;DR

- **The directory shelf is taken.** AlternativeTo has breadth, OpenAlternative is the curated OSS option with about $6.5k MRR, awesome-selfhosted covers self-hosting with 335k stars, and SaaSHub and selfh.st fill out the rest. Building portal number six is a clone of a won idea, which is the lesson from passproof.
- **What's missing is trust, not listings.** Every incumbent shows stars plus "last commit", and that's where they stop. None gives a per-alternative **viability verdict** covering abandonment, bus factor, source-available licenses sold as "open source", recent relicensing, or "this repo is 3 months old with one maintainer". In 2026 that's the real worry: AI makes it cheap to ship an "open-source alternative to X" and cheap to abandon it.
- **Agent access exists, but only to listings, not verdicts.** *(Corrected after re-checking.)* OpenAlternative itself has no public API, MCP server or CLI (`/api` is an empty page). But SaaSHub has a free alternatives API, and third parties already expose OpenAlternative's data to agents (an Apify scraper MCP, "from $4.00 / 1,000 tools scraped", covering 835+ tools; and Context Awesome, 861 resources, with its own MCP server). AlternativeTo has no working public API: `api.alternativeto.net` doesn't resolve (DNS failure, 2026-11-10). There's an npm-package health MCP (`pkgdiet`), but it covers libraries, not apps or SaaS replacements. So "an MCP for alternatives" isn't a gap on its own; "an MCP that tells you which alternative is safe" still is.
- **Wedge:** don't build a portal. Build `altcheck`, a CLI plus MCP server: `npx altcheck notion` returns alternatives with a computed VIABLE / RISKY / AVOID verdict and the reasons. v0 is built in this folder.

## Competitor table

| Portal | Size / traction | Data source | Freshness | Business model | Known complaints |
|---|---|---|---|---|---|
| **AlternativeTo** (alternativeto.net) | Very large. "5M+ monthly visitors" comes from a vendor page, unverified [1] | Crowd: anyone can add or edit [2] | Old reviews; listings go stale [3] | Ads, sponsored content; its disclosure says compensated listings affect ranking [4] | Reviews 10+ years old, outdated info and links [3]; ad clutter [4]; Cloudflare blocks for privacy users [3] |
| **OpenAlternative** (openalternative.co) | ~21 pages of tools; companion awesome list 6.9k★ (CC0, updated daily) [5][6]; ~$6.5k MRR self-reported, tracker shows −32% 30d [7][8] | Curated plus maintainer submissions. Ranking = "health score" from stars, forks, age, recent commits, +5% for verified listings [6] | Good: per-tool stars and last commit | Sponsors/ads, affiliate links. Its own /advertise page lists $147 / $297 / $597 per month tiers; the founder's Dirstarter post separately says "$197/month per listing" for featured listings [7][6] | "isitreallyfoss" says it lists non-OSS projects as open source and takes ad money from non-OSS vendors [9]. No API/MCP/CLI [6] |
| **awesome-selfhosted** (+ `awesome-selfhosted-data`) | 335.7k★; data repo 1.2k★, pushed today [10] | Curated YAML, one file per app (1,360 files counted via the git tree API), with license, stars, archived, release, monthly commit history | Daily refresh | None (community) | Self-hosted only; no "alternative to <SaaS>" mapping; no verdict |
| **RunaCapital/awesome-oss-alternatives** | 19.9k★, MIT [10] | Curated table, ~209 rows with an "Alternative to" column | **Stale: last push 2025-09-03** [10] | VC lead-gen (Runa Capital) | "isitreallyfoss" flags non-OSS entries [11] |
| **SaaSHub** | Not measured (site returned 403 to our fetch) | Vendor-submitted plus crowd | Unknown | Freemium; ~$99/mo featured listing [12]. **Free alternatives API** (`/api/alternatives/{query}`, key from a free account; per third-party docs, not verified first-hand) [15] | Vendor-paid visibility |
| **selfh.st/apps** | Not measured (client-rendered) | Curated; data refreshed from GitHub daily per third-party listing [12] | Daily | Sponsors page [6] | Self-hosted only; no API seen (RSS only) [6] |
| **opensourcealternative.to** | "Found 501 alternatives" (site counter, 2026-11-10; third-party pages still say 250+) [12] | Curated | Unknown | Unknown | Small |
| **Product Hunt "alternatives" pages** | Huge site, thin pages | Product Hunt's own graph | n/a | Launch platform | Not OSS-focused; not evaluated further |
| **Repo-health scorers**: OpenSSF Scorecard (incl. a "Maintained" check over 90 days), deps.dev (Scorecard + license via public API), Snyk Advisor (0–100 package health) [16] | Large, backed by OpenSSF / Google / Snyk | Automated | Scorecard data on deps.dev was dated 2026-08-24 when queried 2026-11-10 | Free | Security-first. Scorecard can penalise finished-but-stable projects. **deps.dev reports Terraform, Outline, Redis and Chatwoot all as just `non-standard`**, so it can't tell BUSL from "AGPL is one of your options" from open-core. Devika has no Scorecard at all. None answers "alternatives to X" |
| **Bus-factor CLIs** (git-tribe, dev-eye, truck-factor, JetBrains Bus Factor Explorer) [16] | Small / research | Git history | Live | Free | Single-signal, research-grade; not tied to choosing a tool |
| **License monitors** (relicense-dev, alexsci Relicensing Monitor, PageCrawl, captnemo "finally-foss") [13] | Small tools | Watch LICENSE files | Live | Freemium/hobby | Separate tools that nobody joins to the alternatives question |
| **Slop trackers** (AlternativeTo "slopware" list, Open-Slopware) [14] | Small lists | Crowd | — | — | Track AI use in projects, not viability |

Not verified (couldn't find reliable data, so left out of the verdict): LibreAlternative, osssoftware.org / "OSS Alternatives".

### GitHub itself is now the real AI-era directory
Searching GitHub for "open source alternative" today returns live, fast-moving projects: Hoppscotch 80.8k★, Jan 45.7k★, Dokploy 38.4k★, meetily 32.6k★ ("alternative to Granola/Otter"), open-seo 27.2k★ ("alternative to Semrush/Ahrefs"), openwork 24.5k★ ("alternative to Claude Cowork"). The same search also turns up **Devika** (19.5k★, "open-source alternative to Devin"), last pushed 2025-09-25. That's 19.5k stars on a project that's gone quiet, and it's the failure mode the existing portals never show. [10]

## Gap analysis (each candidate angle tested)

| Angle | Already done? | Verdict |
|---|---|---|
| Plain directory / search | Yes, by 5+ incumbents | **Won. Don't build.** |
| Project health: commit velocity, archived, last commit | Partly: OpenAlternative shows stars and last commit; awesome-selfhosted-data has commit history | Raw numbers exist, but nobody turns them into a verdict |
| Bus factor | Nobody in this space | **Real gap**, cheap to compute from the contributors API |
| License honesty (BUSL/SSPL/Elastic/FSL sold as OSS) and recent relicensing | Monitors exist separately; directories mislabel (e.g. awesome-selfhosted lists **Outline** as a wiki with `BUSL-1.1`) | **Real gap**: join license class to the alternatives question |
| "New and unproven" (AI-era churn, young single-maintainer repos) | Nobody | **Real gap**, and the topic is loud in 2026 (LeadDev "AI-generated abandonware", Hackaday "vibe coding is killing open source") [14] |
| MCP / CLI so agents can ask | Partly: SaaSHub API; third-party MCP wrappers of OpenAlternative (Apify, Context Awesome); `pkgdiet` for npm libs | **Listings are covered.** Only a verdict-returning MCP is open |
| Feature-parity matrices | Nobody does it well | Real, but needs heavy curation per pair. Not v0 |
| Migration effort / import paths | Nobody | Real, curation-heavy, goes stale. Later, maybe as LLM-assisted per-pair notes |
| Self-host cost / hardware estimate | Nobody systematically | Mostly guesswork. Not v0 |
| "Paste my stack / SaaS bill → alternatives" | Nobody for SaaS (pkgdiet for package.json) | Nice v1 input mode once the verdict engine exists |

**Verdict: crowded but weak, with the weakness in one place.** The listing layer is won (AlternativeTo for breadth, OpenAlternative for curated OSS, awesome-selfhosted for self-hosting). The judgment layer is empty: is this alternative still alive, really open source, and safe to bet on? The narrowest wedge nobody holds is a live, sponsor-free viability verdict that agents can call. Feature matrices, migration guides and cost calculators are the "bigger" version, but each is a curation treadmill that kills solo projects. Earn the right to build those first.

## Pitch

**One sentence:** *Open-source alternatives without the abandonware.* `npx altcheck notion` lists the OSS replacements and tells you which are still safe to bet on.

**Hard constraint:** every verdict is computed live from public repo data, with the reasons printed next to it. No sponsored ranking, no hand-written opinions, no stored scores that go stale.

**Smallest v0 (built):**
- `altcheck <tool>`: candidates come from a bundled seed (Runa's MIT "Alternative to" table) plus a live GitHub search for "<tool> alternative", which also picks up AI-era projects. Each candidate gets a **VIABLE / RISKY / AVOID** verdict from: archived, last push, commits in the last 12 weeks, bus factor, license class (OSI vs source-available vs none), LICENSE file changed recently, and "young + single maintainer".
- `altcheck vet owner/repo` vets any repo.
- `altcheck --mcp` is the same thing as an MCP server (`find_alternatives`, `vet_repo`) for Claude Code / Cursor.
- `--json` for scripts. Zero runtime dependencies. Uses `GITHUB_TOKEN` or `gh auth token` if present.

**The wow demo (30 seconds):** `npx altcheck notion`. Real output from 2026-11-11: AppFlowy comes back VIABLE. **Huly (28k★) comes back RISKY: its README says the repo "is frozen and is no longer actively maintained"**, even though commits still land (caught by the round-2 README check). **Outline (41k★) comes back RISKY: source-available license (BUSL-1.1)**; GitHub labels it `NOASSERTION`, so altcheck reads the license text to catch it. Focalboard (27k★) is RISKY with no commits in 12 weeks, and BoostNote is AVOID because it's archived. `altcheck vet stitionai/devika` returns AVOID, abandoned 411 days ago, despite 20k★. `altcheck vet hashicorp/terraform` returns RISKY with BUSL-1.1. The point is that the star count was lying. The second clip is Claude Code calling `find_alternatives` mid-conversation: "we're about to buy Intercom, what's viable instead?"

**v1 if strangers use it:** `altcheck --stack` (paste a list of SaaS names or a bill CSV), a weekly "your alternatives changed" diff (relicensed, archived), and a static site generated from cached verdicts for SEO.

**Risks, said plainly:**
- **Demand is unproven.** I found qualitative evidence that people care, and no numbers (see "Demand evidence" below). People may be happy with OpenAlternative's stars plus last-commit.
- **The "vet a repo" half isn't new.** OpenSSF Scorecard and deps.dev already score maintenance. What's left is the join (alternatives to X × viability), license-honesty detection (which deps.dev flattens to `non-standard`), and verdicts with reasons that an agent can read.
- **The heuristics are crude.** Bus factor comes from the top 100 contributors, and "LICENSE changed" isn't proof of relicensing. Stable, finished software looks "stale".
- **Unauthenticated use is very limited.** It gets 60 requests an hour, measured as exactly one 10-candidate lookup before a 403. The CLI drops to 5 candidates without a token, which allows about 2 lookups an hour.
- Validate with one launch post before building anything bigger.

## Verification log (2026-11-10)

Everything below was run against live GitHub unless marked "unit".

**License and abandonment benchmark: 22 repos with known ground truth, 22/22 correct after one fix round.**

| Repo | Truth | altcheck |
|---|---|---|
| hashicorp/terraform, hashicorp/vault, akka/akka-core | BUSL-1.1 | RISKY, BUSL-1.1 |
| mongodb/mongo | SSPL | RISKY, SSPL-1.0 |
| getsentry/sentry | FSL | RISKY, FSL-1.1 |
| n8n-io/n8n | Sustainable Use (+ enterprise) | RISKY, Sustainable-Use-1.0 |
| airbytehq/airbyte | ELv2 platform | RISKY, Elastic-2.0 |
| cockroachdb/cockroach | proprietary CockroachDB license | RISKY, "license not recognised: read it" |
| redis/redis | RSALv2 / SSPL / **AGPLv3**, user's choice | VIABLE + note "multi-licensed: you can pick AGPL-3.0" *(first round said SSPL: fixed)* |
| elastic/elasticsearch | AGPL / SSPL / ELv2 (x-pack ELv2 only) | VIABLE + multi-license note *(first round said SSPL: fixed)* |
| mattermost/mattermost | AGPL or commercial | VIABLE + multi-license note *(first round "unrecognised": fixed)* |
| metabase/metabase, PostHog/posthog, chatwoot/chatwoot | OSS core + proprietary `enterprise/` or `ee/` | VIABLE + open-core note *(Metabase was "unrecognised": fixed)* |
| grafana/grafana, opentofu/opentofu, valkey-io/valkey, supabase/supabase, calcom/cal.com | OSI, active | VIABLE |
| stitionai/devika, atom/atom, papercups-io/papercups, facebook/create-react-app | abandoned / archived / deprecated | AVOID |

The 12 real license texts behind these are saved in `test/fixtures/licenses/` and run as regression tests.

**Live-search precision: 12 tools** (Slack, Jira, Figma, Zapier, Postman, Heroku, Google Analytics, Firebase, 1Password, Dropbox, Airtable, DocuSign). It was about 85% at first, judged by hand. After requiring "alternative" and the tool name in the same sentence and dropping list repos, it's about 94%. Remaining false positives: `firebase-auth-lite` (a library), `ayakaleaf-pro` (an Overleaf replacement that mentions Dropbox), and `selfhost-ai` (an installer). **Recall** depends on the seed list. Live search misses projects whose description doesn't say "alternative to X" (Bitwarden, Nextcloud, Seafile), but the seed supplies Bitwarden, Passbolt and Nextcloud. Tools in neither: LastPass; Vercel and GitHub are live search only.

**Bugs found by this audit and fixed:**
- `--version` printed the help text.
- `--limit=N` was ignored.
- Stale seed entries pushed out the best live results: Matomo and Plausible were missing for "google analytics".
- A repo that had been renamed was listed twice.
- `../x` got past repo validation.
- Rate-limit, bad-token and offline errors were swallowed inside a repo check, so verdicts silently lost data.
- The stats endpoint's 202 ("still computing") answer skipped the activity check; it now falls back to counting commits.

**Runtime checks:**
- Node 24 and **Node 18.20.8**: 48/48 tests pass.
- `npm pack` and installing from the tarball: the CLI and MCP work.
- **Official MCP TypeScript SDK client (v1.32.2)** over stdio: handshake, `tools/list`, both tools with live data, bad input (`isError`), unknown tool (−32602) and ping all OK.
- Not tested inside the Claude Code or Cursor apps. Launching Claude Code from inside this Claude Code session is blocked.
- Unauthenticated: the first lookup succeeds and the second gets "rate limit hit (resets in 60 min)…".
- Bad token: a clear 401 message. Offline: "cannot reach api.github.com (ENOTFOUND)".

**Claims re-verified first-hand** (page fetched, not a search snippet): OpenAlternative's $6.5k MRR (founder post), its ad tiers, the Apify and Context Awesome MCP access, the isitreallyfoss critique, opensourcealternative.to's 501, and pkgdiet being npm-only. **Could not verify:** the IndieHackers revenue post (403), SaaSHub's API page (403; the endpoint is confirmed only via apis.io), selfh.st's app count (client-rendered), and AlternativeTo's traffic.

## Held-out benchmark (2026-11-10): the honest numbers

The numbers above were measured on the same examples the rules were tuned on, so they're optimistic. This benchmark uses **30 repos and 20 tools never used during tuning**. Expectations were written down first (`bench/heldout.json`), ground truth was set from the raw LICENSE text and GitHub's archived flag (never from altcheck output), and everything was **scored once, with no rule changes in between**. Rerun it with `node bench/run.mjs repos` or `node bench/run.mjs tools`.

**Repos (30):**

| Metric | Score |
|---|---|
| Maintenance status (abandoned → AVOID, active → not flagged) | **29/30** (miss: moment/moment, officially in maintenance mode but still committing, so it shows VIABLE) |
| Exact license class | **23/30** (77%) |
| License misses that still came out RISKY ("read it") | 4: directus (Monospace license), confluent ksql, tldraw (custom licenses), redpanda (no LICENSE at root) |
| License misses, other | 3: timescaledb and dub (open-core phrased differently, so "unrecognised" and RISKY instead of VIABLE); meilisearch (MIT core + BUSL EE, so "source-available" instead of open-core) |
| **Dangerous errors: VIABLE for a non-open-source or abandoned project** | **0/30** |

Every error leaned cautious: never "safe" when it wasn't, sometimes "check this" when it was fine.

**Tools (20): Trello, Asana, Mailchimp, Typeform, Calendly, Loom, Miro, Photoshop, Canva, Discord, Zoom, Shopify, Algolia, Auth0, Hotjar, Mixpanel, Retool, Webflow, Linear, ChatGPT.** Raw output is in `bench/results-tools-2026-11-10.txt`.

| Metric | Score |
|---|---|
| Recall: at least one well-known alternative found | **16/20**. The script printed 15, but Calendly's Cal.com is there under its renamed repo `calcom/cal.diy`. Misses: **Miro** (Excalidraw and tldraw don't say "Miro"), **Canva** (no Penpot), **Discord** (no Revolt/Stoat or Element), **Hotjar** (0 results) |
| Precision: results that are real alternatives, judged by hand | **~97/116 = 84%** (not the 94% measured on the tuning set) |

**What the held-out run exposed** (not fixed yet; any fix needs a *new* held-out set to re-measure):
1. **Sentence splitting on " - " hurts recall.** "alternative for Mixpanel - Amplitude - Hotjar" gets split apart, which is why Hotjar returned nothing.
2. **Tools whose names are common words pull in junk.** "Linear" matched a Rust HashMap crate, and "Zoom" matched a computer-vision paper list.
3. **Alternative *clients* aren't alternatives.** "An alternative Discord client" (Dorion, Abaddon, OpenAsar) is still Discord.
4. **Same-org demo repos** (`typesense/showcase-*`), and Jina Serve showing up as an Algolia alternative.
5. **More open-core phrasings to recognise:** "Except for the Enterprise Edition…" (Medusa), "variously licensed under Apache … or the Timescale License", and "Portions … namely files under (ee)" (dub).
6. **The seed list points at the wrong repos:** `taigaio/taiga-docker` (so Taiga gets AVOID), `FusionAuth/fusionauth-containers`. That's a curation problem in the year-old Runa list.
7. **Projects that don't host on GitHub are invisible:** GIMP, Krita and Inkscape live on GNOME/KDE GitLab, so Photoshop results are thin.
8. **"No license file" is wrong** when licenses sit in a subfolder (redpanda's `licenses/`).
9. **Maintenance-mode projects look healthy** when maintainers still commit (moment).

**Takeaway:** the safety property holds on unseen data (0 dangerous VIABLEs), and status detection is strong (29/30). Search quality is the weak part: 84% precision and 80% recall. That's usable for v0 if it's stated honestly, and items 1–4 are the cheapest improvements.

## Round 2: fixes, then a second held-out set (2026-11-11)

**Fixed** (each has a regression test in `test/heldout-regressions.test.js` built from the real failing text):
- The search filter now requires the tool name within 100 characters of "alternative" in the same sentence. It no longer splits on " - ", and it treats double spaces and Chinese punctuation as sentence breaks.
- Product names that are common words (linear, zoom, notion, slack, loom…) must be written as names.
- "<tool> client / bot / mod / app.asar" repos are rejected.
- Demo, showcase, template and starter repos are dropped, and live search keeps only one repo per organisation.
- It now fetches 3x as many search results before filtering. It's still one request.
- New open-core wordings: "Except for the Enterprise Edition", "variously licensed", "Enterprise Edition (EE)", "Portions of this software – namely". Open-core is now checked before BUSL/SSPL, but only when an OSI license is named, so n8n stays source-available.
- Licenses kept in a subfolder or in `LICENSE-2.0.txt` now say "read it", not "you have no right to use it".
- READMEs that say "maintenance mode", "no longer maintained", "legacy project" or "this project is deprecated" are now flagged RISKY. This costs one extra request per repo.
- The seed list was corrected (`data/seed-overrides.json`): Taiga now points at its code, and FusionAuth was removed because it isn't open source.

**Held-out set #2** (`bench/heldout-2.json`): 30 repos and 20 tools never used before. Expectations were written first, truth came from the raw LICENSE and README text, and it was scored once. My own expectations were wrong on 2 of 30. Documenso is plain AGPL. **NocoDB quietly relicensed from AGPL to the Sustainable Use License in January 2026**, and altcheck caught it.

| Metric | Set #1 (round 1, blind) | Set #2 (round 2, blind) | Set #1 rerun after fixes (no longer blind) |
|---|---|---|---|
| Status (abandoned / maintenance / active) | 29/30 | **30/30** | 30/30 |
| Exact license class | 23/30 | **25/30** | 26/30 |
| License misses that lean cautious | 7/7 | 5/5 | 4/4 |
| **Dangerous: VIABLE for a non-OSS or abandoned repo** | **0** | **0** | **0** |
| Tool recall (strict: one of *my* listed well-known alternatives) | 16/20 | 12/20 | 15/20 (+ Hotjar now finds fusion, which isn't on my list) |
| Tool recall (lenient: at least one real alternative) | ~18/20 | ~18/20 (LastPass: none; Teams: only a video tool) | — |
| Search precision (judged by hand) | 84% | **~89%** (80/90) | visible junk gone; 2 new Discord bots slipped in |

**Set #2 remaining misses** (cautious, not fixed, since the stopping rule was one fix round):
- **Custom licenses read as "unrecognised":** the ScyllaDB and Dragonfly source-available licenses, and Twenty's "AGPL except files marked @license Enterprise".
- **Hystrix's** `LICENSE-2.0.txt` comes out "read it", where the truth is Apache.
- **Flux's** BSD text isn't recognised.

**Biggest remaining search problem: ambiguous brand names.** "GitHub" scored 2/10 relevant, because it pulled in GitHub *Copilot* alternatives, `github.com/...` URLs and "[DEPRECATED] Alternative: https://github.com/…" notes. "Framer" pulled in "Framer Motion for Svelte". The fix is to reject URL occurrences and compound product names (Copilot, Codespaces, Gist, Motion), and it's post-launch work.

**Recall limit:** the biggest, best-known projects often don't call themselves "an alternative to X": Immich, Bitwarden, LanguageTool, Mattermost, Listmonk. Live search can't find them, so they only appear when the seed list has them. A better seed (merging awesome-selfhosted and OpenAlternative's free-to-reuse list) is the real recall fix.

**Verdict:** the safety property held on both unseen sets (0 dangerous of 60), status detection is strong (59/60 blind), and license detection is cautious when it's unsure. Search is good enough for v0 (~89%), with known weak spots. **Testing stops here.** Real users will find more than another round of my own examples.

## Demand evidence (qualitative only)

- Relicensing is a documented, recurring disruption. Dawn Foster's CHAOSS study and FOSDEM 2025 talk cover Elasticsearch→OpenSearch, Redis→Valkey and Terraform→OpenTofu, and The New Stack ran a "license rug pull vent" session at SOOSS25 [17].
- Practitioners publish checklists for "is this project safe to adopt?": BookStack's maintainer on "amber flags" in self-hosted projects, Appwrite's maturity guide, and the OpenSSF Concise Guide. People do the check by hand, which is the job altcheck automates [17].
- AI-generated abandonware is a 2026 talking point: LeadDev, Hackaday, and Flathub's AI-slop policy [14].
- **Missing:** any number. There are no search volumes, no poll and no paid product. Treat this as "plausible pain", not "proven demand".

## Sources
1. https://peerpush.com/compare/alternativeto
2. https://peerpush.com/compare/alternativeto
3. https://lemm.ee/comment/14402944 · https://lemm.ee/comment/14402981 · https://www.rfp.wiki/vendors/alternativeto
4. https://alternativeto.net/software/openalternative/ (disclosure) · https://gracker.ai/b2b-saas-growth-tools/tool/alternativeto
5. https://openalternative.co
6. https://openalternative.co/about · https://github.com/piotrkulpinski/open-source-alternatives · https://selfh.st/apps/
7. https://dirstarter.com/blog/openalternative-case-study · https://www.indiehackers.com/post/2KasH9NLK3ehlTL9GeGO
8. https://shipbydata.pages.dev/en/startup/openalternative
9. https://isitreallyfoss.com/projects/openalternative
10. GitHub API, queried 2026-11-10 (`gh api repos/...`, `gh search repos "open source alternatives"`)
11. https://isitreallyfoss.com/projects/runa-oss-alternatives
12. https://www.saashub.com/compare-open-source-alternative-to-vs-saashub · https://alternativeto.net/software/selfh-st/
13. https://relicense-dev.pages.dev/ · https://alexsci.com/relicensing-monitor/ · https://pagecrawl.io/blog/open-source-relicensing-license-change-monitoring · https://captnemo.in/finally-foss/about
15. https://apis.io/apis/saashub/saashub-alternatives-api/ · https://www.indiehackers.com/product/saashub/-MISvqtfrcWWJn_xDwkW · https://apify.com/gorkha-io/open-alternative-scraper/api/mcp · https://www.context-awesome.com/list/piotrkulpinski/openalternative · https://providers.apievangelist.com/providers/alternativeto/
16. https://scorecard.dev/ · https://deps.dev (API queried: `api.deps.dev/v3/projects/github.com%2F<owner>%2F<repo>`) · https://socket.dev/glossary/openssf-scorecard · https://www.safeguard.sh/resources/blog/open-source-package-health-scoring-explained · https://pypi.org/project/git-tribe/ · https://socket.dev/npm/package/dev-eye · https://github.com/mtov/truck-factor
17. https://arxiv.org/abs/2411.04739 · https://fosdem.org/schedule/event/fosdem-2025-5258-forked-communities-project-re-licensing-and-community-impact · https://thenewstack.io/the-open-source-license-rug-pull-vent-get-your-fill-at-soo25/ · https://danb.me/blog/os-selfhosted-project-flags/ · https://appwrite.io/blog/post/how-to-evaluate-open-source-maturity-before-using-it-in-production.md · https://best.openssf.org/Concise-Guide-for-Evaluating-Open-Source-Software
14. https://leaddev.com/software-quality/ai-generated-abandonware-is-hollowing-out-open-source · https://hackaday.com/2026/02/02/how-vibe-coding-is-killing-open-source/ · https://alternativeto.net/list/44427/slopware/
