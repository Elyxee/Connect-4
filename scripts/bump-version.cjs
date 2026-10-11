#!/usr/bin/env node
// Sets the app version used for cache busting, so browsers and the service
// worker fetch changed files instead of stale copies.
//   node scripts/bump-version.cjs        → current version + 1
//   node scripts/bump-version.cjs 60     → version 60
// Rewrites every ?v=<n> in index.html and sw.js, and the service worker CACHE_NAME.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = ['index.html', 'sw.js'].map((name) => path.join(root, name));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const current = Number(sw.match(/CACHE_NAME = "c4-notes-main-v(\d+)"/)?.[1]);
if (!current) throw new Error('CACHE_NAME not found in sw.js');
const next = process.argv[2] ? Number(process.argv[2]) : current + 1;
if (!Number.isInteger(next) || next <= 0) throw new Error(`Invalid version: ${process.argv[2]}`);

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
    .replace(/\?v=\d+/g, `?v=${next}`)
    .replace(/CACHE_NAME = "c4-notes-main-v\d+"/, `CACHE_NAME = "c4-notes-main-v${next}"`);
  fs.writeFileSync(file, text);
}
console.log(`Version ${current} → ${next}`);
