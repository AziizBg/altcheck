// Real LICENSE heads (first 4 KB) fetched 2026-11-10, where GitHub reports NOASSERTION or a
// source-available license. Guards the sniffer against regressions on texts that actually exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sniffLicense, classifyLicense } from '../src/verdict.js';

const EXPECTED = {
  hashicorp_terraform: ['BUSL-1.1', 'source-available'],
  getsentry_sentry: ['FSL-1.1', 'source-available'],
  'n8n-io_n8n': ['Sustainable-Use-1.0', 'source-available'],
  airbytehq_airbyte: ['Elastic-2.0', 'source-available'],
  redis_redis: ['multi:AGPL-3.0', 'multi-osi'], // RSALv2 / SSPL / AGPLv3, your choice
  elastic_elasticsearch: ['multi:AGPL-3.0', 'multi-osi'], // AGPL / SSPL / ELv2
  mattermost_mattermost: ['multi:AGPL-3.0', 'multi-osi'], // AGPL or commercial
  chatwoot_chatwoot: ['open-core', 'open-core'],
  metabase_metabase: ['open-core', 'open-core'],
  PostHog_posthog: ['open-core', 'open-core'],
  medusajs_medusa: ['open-core', 'open-core'], // "Except for the Enterprise Edition materials ... MIT"
  timescale_timescaledb: ['open-core', 'open-core'], // "variously licensed under the Apache License ... or the Timescale License"
  dubinc_dub: ['open-core', 'open-core'], // "Portions of this software – namely ... (ee)"
  meilisearch_meilisearch: ['open-core', 'open-core'], // MIT + Enterprise Edition (EE) under BUSL
  'BoostIO_BoostNote-App': [null, 'unclear'], // plain GPL-3.0-or-later: "(at your option) any later version" is not multi-licensing
  cockroachdb_cockroach: [null, 'unclear'], // proprietary "CockroachDB Software License"
  arp242_goatcounter: [null, 'unclear'], // modified EUPL: a human should read it
};

for (const [file, [id, cls]] of Object.entries(EXPECTED)) {
  test(`sniff ${file} -> ${id}`, () => {
    const text = readFileSync(new URL(`./fixtures/licenses/${file}.txt`, import.meta.url), 'utf8');
    const got = sniffLicense(text);
    assert.equal(got, id);
    assert.equal(classifyLicense(got ?? 'NOASSERTION'), cls);
  });
}
