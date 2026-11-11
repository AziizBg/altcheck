# altcheck

**Open-source alternatives, without the abandonware.**

Directories tell you what alternatives *exist*. `altcheck` tells you which ones are still **safe to bet on**, checked live against GitHub with the reasons printed next to each verdict.

![altcheck notion: Outline flagged for its BUSL license, Huly for a frozen repo, BoostNote archived](https://raw.githubusercontent.com/AziizBg/altcheck/main/docs/demo.gif)

```bash
npx altcheck notion
```

```
Alternatives to notion: 3 VIABLE, 6 RISKY, 1 AVOID

VIABLE   AppFlowy-IO/AppFlowy             ★ 79k     AGPL-3.0        pushed 8d ago     bus 2
VIABLE   docmost/docmost                  ★ 22k     AGPL-3.0        pushed today      bus 1
         ↳ bus factor 1: one person wrote most of it
RISKY    outline/outline                  ★ 41k     BUSL-1.1        pushed today      bus 1
         ↳ source-available license (BUSL-1.1), not OSI open source
RISKY    hcengineering/platform           ★ 28k     EPL-2.0         pushed 1d ago     bus 3
         ↳ README says "no longer actively maintained"
RISKY    mattermost-community/focalboard  ★ 27k     multi:AGPL-3.0  pushed 6mo ago    bus 3
         ↳ no commits on the default branch in the last 12 weeks
...
```
(Excerpt of real output from 2026-11-11.)

Outline has 41k stars and is often listed as an open-source Notion alternative, but its license is BUSL. Huly (28k★) still gets commits, but its README says the repo is frozen and the hosted service has shut down. Stars and "last commit" show neither.

## Use it

```bash
npx altcheck intercom              # alternatives + verdicts
npx altcheck vet hashicorp/terraform   # vet any single repo
npx altcheck zapier --json --limit 5   # for scripts
```

### As an MCP server (Claude Code, Cursor, …)

```bash
claude mcp add altcheck -- npx -y altcheck --mcp
```

Tools: `find_alternatives { tool }` and `vet_repo { repo }`. Then ask: *"We're about to buy Intercom. What's a viable open-source alternative?"*

## What it checks

| Signal | Verdict impact |
|---|---|
| Archived, or no push in 365+ days | **AVOID** |
| No commits on the default branch in 12 weeks / no push in 180+ days | RISKY |
| Source-available license (BUSL, SSPL, Elastic, FSL, Commons Clause, PolyForm, Sustainable Use). Detected from the license text when GitHub says `NOASSERTION` | RISKY |
| No license, or one GitHub can't recognise | RISKY |
| LICENSE file changed in the last 2 years on an old repo (possible relicensing) | RISKY if non-OSI, note otherwise |
| Younger than 6 months (unproven), and bus factor 1 on a young repo | RISKY |
| Multi-licensed with an OSI option (e.g. Redis 8, Elasticsearch: "AGPL or SSPL or …") | note |
| Open-core (OSS core plus a proprietary `enterprise/` or `ee/` directory) | note |
| Bus factor 1 on an established repo | note |

Candidates come from two places:
1. **Seed:** [RunaCapital/awesome-oss-alternatives](https://github.com/RunaCapital/awesome-oss-alternatives) (MIT), 213 projects mapped to 134 proprietary tools.
2. **Live:** GitHub repos with 100+ stars whose description says they're an alternative to the tool. This catches the new AI-era projects the lists haven't added yet.

**Rule:** every verdict is computed live from public data. There's no sponsored ranking and no hand-written opinions.

## Auth & limits

It uses `GITHUB_TOKEN`, `GH_TOKEN` or `gh auth token` if one is available. Each repo check costs about 5 requests. With a token (5,000 requests an hour) it checks 10 candidates by default. Without one, GitHub allows 60 an hour, so altcheck checks 5 candidates, which allows about **2 lookups an hour**. It tells you when the limit resets.

## How is this different from OpenSSF Scorecard / deps.dev?

Those score a repo you've already picked, mostly for security, and deps.dev reports Terraform (BUSL), Redis (AGPL-or-SSPL) and Chatwoot (open-core) all as `non-standard`. altcheck starts from the tool you want to replace, reads the license text to tell those cases apart, and gives a verdict with reasons that a person or an agent can act on.

## Honest limitations

- Bus factor is computed from the top 100 contributors' commit counts. It's a rough signal.
- "LICENSE changed" is often just a copyright-year bump. It's a prompt to look, not proof.
- Live search depends on how a repo describes itself. A project that calls itself "an open-source Notion alternative" gets in even if it's really something else.
- Which candidates make the cut is ordered, not ranked: live results (by stars) interleaved with the seed list. A good alternative can fall past `--limit`, so raise it if you're unsure.
- Stable, finished software (few commits because nothing needs changing) gets flagged as stale. Read the reason, not just the label.
- License-text detection reads the first 4 KB of the LICENSE file. A license explained only in a README or in per-file headers can be missed.
- **Measured on two blind benchmarks** (60 repos and 40 tools in total, each never used for tuning and scored once; see `bench/`):
  - status 59/60;
  - exact license class 48/60, with every miss cautious: **0 cases of VIABLE for a non-OSS or abandoned repo**;
  - search precision about 84%, then about 89% after one round of fixes.
- Ambiguous brand names are noisy: "github" also matches Copilot and `github.com` URLs; "framer" matches Framer Motion.
- Big projects that don't call themselves "an alternative to X" (Immich, Bitwarden, Mattermost) only appear if the seed list has them.
- Projects not hosted on GitHub (GIMP, Krita, Inkscape) are invisible.
- The MCP server is tested with the official MCP TypeScript SDK client over stdio, but not yet inside the Claude Code or Cursor apps.

## Development

```bash
npm test             # node:test, no network
npm run build:seed   # regenerate data/seed.json from scripts/runa-README.snapshot.md
```

Zero runtime dependencies. Node 18 or newer. MIT.
