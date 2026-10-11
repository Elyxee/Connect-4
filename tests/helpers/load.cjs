// Runs src/ scripts in a vm context the way index.html loads them: classic
// scripts sharing one global scope, in the given order.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', '..', 'src');

function loadScripts(context, names) {
  if (!vm.isContext(context)) vm.createContext(context);
  for (const name of names) {
    const file = path.join(SRC, `${name}.js`);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return context;
}

module.exports = { loadScripts };
