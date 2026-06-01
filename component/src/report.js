'use strict';

const fs = require('fs');
const path = require('path');

// Recursively measure total byte size and file count of a path.
// Symlinks are not followed (avoids double-counting / cycles).
function measure(target, { ignore = [] } = {}) {
  const ignoreSet = new Set(ignore);
  let bytes = 0;
  let files = 0;

  function walk(p) {
    let st;
    try {
      st = fs.lstatSync(p);
    } catch {
      return;
    }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) {
      if (ignoreSet.has(path.basename(p))) return;
      let entries;
      try {
        entries = fs.readdirSync(p);
      } catch {
        return;
      }
      for (const name of entries) walk(path.join(p, name));
    } else if (st.isFile()) {
      bytes += st.size;
      files += 1;
    }
  }

  walk(target);
  return { bytes, files };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i += 1;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(2)} ${units[i]}`;
}

// Reduction as a signed percentage string. Negative = smaller (good).
function reductionPct(before, after) {
  if (before <= 0) return '0.00%';
  const r = (1 - after / before) * 100;
  const sign = r >= 0 ? '-' : '+';
  return `${sign}${Math.abs(r).toFixed(2)}%`;
}

function buildReport(before, after) {
  return {
    before,
    after,
    sizeReduction: reductionPct(before.bytes, after.bytes),
    fileReduction: reductionPct(before.files, after.files),
  };
}

function renderTable(report) {
  const { before, after } = report;
  const rows = [
    ['', 'Before', 'After', 'Reduction'],
    ['Size', formatBytes(before.bytes), formatBytes(after.bytes), report.sizeReduction],
    ['Files', String(before.files), String(after.files), report.fileReduction],
  ];
  const widths = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => r[i].length)));
  const render = (r) => r.map((c, i) => c.padEnd(widths[i])).join('   ');
  return rows.map(render).join('\n');
}

module.exports = { measure, formatBytes, reductionPct, buildReport, renderTable };
