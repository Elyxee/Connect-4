const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadScripts } = require('./helpers/load.cjs');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const css = read('src/style.css');
const sw = read('sw.js');

const swAssets = vm.runInNewContext(`${sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1]}`);
const swVersion = sw.match(/CACHE_NAME = "c4-notes-main-v(\d+)"/)[1];
const strip = (url) => url.replace(/\?v=\d+$/, '');

/* Every local file the app requests: index.html, style.css and CONFIG.assets. */
function requestedFiles() {
  const files = new Set();
  for (const [, url] of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) files.add(url);
  for (const [, url] of css.matchAll(/url\(["']?\.\.\/([^"')]+)["']?\)/g)) files.add(`./${url}`);
  const { CONFIG } = vm.runInContext('({CONFIG})', loadScripts({}, ['config']));
  const { board, chips, orbitLives, cssBackgrounds, clockArtDir } = CONFIG.assets;
  [board, ...Object.values(chips), ...Object.values(orbitLives), ...cssBackgrounds].forEach((url) => files.add(url));
  for (const state of ['setup', 'red-active', 'yellow-active', 'full-red', 'full-yellow']) files.add(`${clockArtDir}${state}.png`);
  return [...files];
}

test('every requested file exists', () => {
  for (const url of requestedFiles()) assert.ok(fs.existsSync(path.join(root, strip(url))), `${url} is missing`);
});

test('the service worker precaches every requested file under the same URL', () => {
  const cached = new Set(swAssets);
  for (const url of requestedFiles()) {
    if (url === './manifest.json' || url.startsWith('./src/') || url.startsWith('./assets/')) {
      assert.ok(cached.has(url), `sw.js ASSETS is missing ${url}`);
    }
  }
  for (const url of swAssets) assert.ok(url === './' || fs.existsSync(path.join(root, strip(url))), `sw.js caches missing file ${url}`);
});

test('code and stylesheet cache-busting versions match the service worker', () => {
  for (const [, file, version] of html.matchAll(/"\.\/(src\/[^"?]+)\?v=(\d+)"/g)) {
    assert.equal(version, swVersion, `${file} uses ?v=${version}; run node scripts/bump-version.cjs`);
  }
});
