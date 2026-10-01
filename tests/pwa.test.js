import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function listJs(dir) {
  return readdirSync(join(root, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    return statSync(join(root, rel)).isDirectory() ? listJs(rel) : rel.endsWith('.js') ? [rel] : [];
  });
}

test('service worker pre-caches files that exist, including every app module', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const list = JSON.parse(sw.match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const f of list) if (f !== './') assert.ok(existsSync(join(root, f)), `missing ${f}`);
  for (const f of listJs('js')) assert.ok(list.includes(f), `${f} is not pre-cached`);
});

test('manifest is valid and its icons exist', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.ok(m.icons.some((i) => i.sizes === '512x512'));
  for (const i of m.icons) assert.ok(existsSync(join(root, i.src)), i.src);
});
