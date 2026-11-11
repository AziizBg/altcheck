import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRunaReadme, indexByTool, normalizeTool } from '../src/seed.js';
import { loadSeed, seedCandidates } from '../src/core.js';

const SAMPLE = `|Category|Company|Description|GitHub Stars|Alternative to|
|:-------|:------|:----------|:----------:|:------------:|
Project Management|[Plane](https://plane.so/)|Alternative to Linear, JIRA|<a href=https://github.com/makeplane/plane><img src="x" width=150/></a>|[Linear](https://linear.app/), [JIRA](https://www.atlassian.com/software/jira)|
Notetaking|[AppFlowy](https://www.appflowy.io/)|Open-source alternative to Notion|<a href=https://github.com/AppFlowy-IO/appflowy><img src="x"/></a>|[Notion](https://www.notion.so/)
Not a row at all
`;

test('parses table rows with repo and alternativeTo', () => {
  const rows = parseRunaReadme(SAMPLE);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    name: 'Plane',
    repo: 'makeplane/plane',
    category: 'Project Management',
    description: 'Alternative to Linear, JIRA',
    alternativeTo: ['Linear', 'JIRA'],
  });
  assert.equal(rows[1].repo, 'AppFlowy-IO/appflowy');
});

test('indexes by normalised proprietary name', () => {
  const idx = indexByTool(parseRunaReadme(SAMPLE));
  assert.equal(idx.jira[0].repo, 'makeplane/plane');
  assert.equal(idx.notion[0].name, 'AppFlowy');
});

test('normalizeTool strips case, punctuation and TLDs', () => {
  assert.equal(normalizeTool('Notion.so'), 'notion');
  assert.equal(normalizeTool('Google Analytics'), 'googleanalytics');
  assert.equal(normalizeTool('JIRA'), 'jira');
});

test('bundled seed covers common tools', () => {
  const seed = loadSeed();
  for (const tool of ['notion', 'intercom', 'Firebase', 'Zapier']) {
    assert.ok(seedCandidates(tool, seed).length > 0, `seed has ${tool}`);
  }
});
