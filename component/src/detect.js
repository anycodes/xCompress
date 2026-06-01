'use strict';

const fs = require('fs');
const path = require('path');

const SRC_EXT = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.mts', '.cts']);

// True when `arg` is a single, fully-static module specifier that a bundler
// can resolve at build time: 'x', "x", or `x` with no ${} interpolation.
function isStaticArg(arg) {
  const s = arg.trim();
  if (/^(['"])(?:[^'"\\]|\\.)*\1$/.test(s)) return true; // 'literal' / "literal"
  if (/^`[^`$]*`$/.test(s)) return true; // `literal` with no interpolation
  return false;
}

function scanFile(file) {
  let txt;
  try {
    txt = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const found = [];
  const lines = txt.split(/\r?\n/);

  // Scan full text to handle multi-line require/import calls
  const re = /\b(require|import)\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(txt))) {
    const arg = m[2];
    if (arg.trim() === '') continue;
    if (!isStaticArg(arg)) {
      // Compute line number from character offset
      const lineNum = txt.slice(0, m.index).split(/\r?\n/).length;
      const snippet = lines[lineNum - 1].trim().slice(0, 120);
      found.push({ file, line: lineNum, snippet });
    }
  }
  return found;
}

// Walk the user's own source (never node_modules / output) looking for
// dynamic require()/import() calls. Bundlers leave these as runtime calls and
// do NOT bundle the target, so the artifact breaks at runtime — we warn.
function scanDynamicRequire(root, ignoreNames = []) {
  const ignore = new Set(['node_modules', '.git', '.scc-tmp', ...ignoreNames]);
  const found = [];
  (function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (ignore.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(full);
      else if (SRC_EXT.has(path.extname(e.name))) found.push(...scanFile(full));
    }
  })(root);
  return found;
}

// Walk the user's own source looking for __dirname / __filename. After
// bundling, these resolve to the OUTPUT dir, so any data file read relative to
// them (templates, .json, .pem, .env, ...) is missing unless copied as an asset.
function scanDirnameUsage(root, ignoreNames = []) {
  const ignore = new Set(['node_modules', '.git', '.scc-tmp', ...ignoreNames]);
  const found = [];
  (function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (ignore.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        walk(full);
      } else if (SRC_EXT.has(path.extname(e.name))) {
        let txt;
        try {
          txt = fs.readFileSync(full, 'utf8');
        } catch {
          continue;
        }
        txt.split(/\r?\n/).forEach((line, i) => {
          if (/\b__dirname\b|\b__filename\b/.test(line)) {
            found.push({ file: full, line: i + 1, snippet: line.trim().slice(0, 120) });
          }
        });
      }
    }
  })(root);
  return found;
}

module.exports = { scanDynamicRequire, scanDirnameUsage, isStaticArg };
