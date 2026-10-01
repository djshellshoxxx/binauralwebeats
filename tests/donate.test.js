import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guard against typos: every copy of the donation address must be identical.
const ADDR = '85cSWLFurZj8XbKWX7Kk3u1oUtp5vLGQcLSfXEdGnTUU5P9mik6GCPk8guPfAwzHdFFUCbDKChZEphQyp6BNMQwo5oyPLUD';
const root = new URL('..', import.meta.url).pathname;

test('Monero address is identical everywhere it appears', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const found = [...html.matchAll(/8[1-9A-HJ-NP-Za-km-z]{94}/g)].map((m) => m[0]);
  assert.equal(found.length, 3, 'shown text, copy button and wallet link');
  for (const a of found) assert.equal(a, ADDR);
  assert.ok(html.includes(`href="monero:${ADDR}"`));
  assert.ok(readme.includes(ADDR));
  const readmeFound = [...readme.matchAll(/8[1-9A-HJ-NP-Za-km-z]{94}/g)].map((m) => m[0]);
  for (const a of readmeFound) assert.equal(a, ADDR);
});
