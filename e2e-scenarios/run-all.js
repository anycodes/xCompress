#!/usr/bin/env node
'use strict';

/**
 * End-to-end scenario runner.
 * Installs dependencies, compresses each scenario, verifies the handler works.
 *
 * Usage:  node e2e-scenarios/run-all.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { compress } = require('../src/index');
const Component = require('../component');

const SCENARIOS = [
  {
    name: 'express-serverless',
    dir: path.join(__dirname, 'express-serverless'),
    opts: { runtime: 'node', handler: 'handler', engine: 'auto' },
    verify: (mod) => mod.handler({ httpMethod: 'GET', path: '/' }),
  },
  {
    name: 'heavy-deps',
    dir: path.join(__dirname, 'heavy-deps'),
    opts: { runtime: 'node', handler: 'handler', engine: 'auto' },
    verify: (mod) => mod.handler({}),
  },
  {
    name: 'typescript',
    dir: path.join(__dirname, 'typescript'),
    opts: { runtime: 'node', handler: 'handler', engine: 'esbuild', entry: 'index.ts' },
    verify: (mod) => mod.handler({ name: 'Reviewer', count: 2 }),
  },
  {
    name: 'native-addon (with --external)',
    dir: path.join(__dirname, 'native-addon'),
    opts: { runtime: 'node', handler: 'handler', engine: 'esbuild', externals: ['bcrypt'] },
    verify: null, // can't verify without bcrypt in the output dir
  },
  {
    name: 'serverless-devs-component',
    dir: path.join(__dirname, 'serverless-devs-integration', 'code'),
    componentCwd: path.join(__dirname, 'serverless-devs-integration'),
    opts: { runtime: 'node', handler: 'handler', engine: 'auto', out: 'dist' },
    verify: (mod) => mod.handler({}),
  },
];

async function run() {
  let passed = 0;
  let failed = 0;

  process.stdout.write('Installing locked Serverless Devs component dependencies...\n');
  execSync('npm ci --omit=dev --no-audit --no-fund', {
    cwd: path.join(__dirname, '..', 'component'),
    stdio: 'ignore',
  });

  for (const s of SCENARIOS) {
    process.stdout.write(`\n[${'='.repeat(60)}]\n  ${s.name}\n`);

    // Recreate dependencies from the committed lockfile for every run.
    process.stdout.write('  Installing locked production dependencies...\n');
    execSync('npm ci --omit=dev --no-audit --no-fund', { cwd: s.dir, stdio: 'ignore' });

    try {
      const result = s.componentCwd
        ? await new Component().compress({
            cwd: s.componentCwd,
            props: { src: './code', ...s.opts },
          })
        : await compress(s.dir, { ...s.opts, out: 'dist' });
      const before = result.report.before;
      const after = result.report.after;
      process.stdout.write(
        `  Engine: ${result.engine}\n` +
        `  Before: ${before.files} files, ${(before.bytes / 1024 / 1024).toFixed(2)} MB\n` +
        `  After:  ${after.files} file(s), ${(after.bytes / 1024).toFixed(1)} KB\n` +
        `  Reduction: ${result.report.sizeReduction}\n` +
        `  Self-check: ${result.check ? (result.check.ok ? 'PASS' : 'FAIL: ' + result.check.reason) : 'skipped'}\n`
      );

      if (result.warnings.length) {
        process.stdout.write(`  Warnings: ${result.warnings.length}\n`);
      }

      if (s.verify) {
        const mod = require(path.join(s.dir, 'dist', 'index.js'));
        const output = await s.verify(mod);
        process.stdout.write(`  Handler invoke: OK (${JSON.stringify(output).slice(0, 80)}...)\n`);
      }

      process.stdout.write('  RESULT: PASS\n');
      passed++;
    } catch (e) {
      process.stdout.write(`  RESULT: FAIL — ${e.message.split('\n')[0]}\n`);
      failed++;
    }

    // Clean dist
    fs.rmSync(path.join(s.dir, 'dist'), { recursive: true, force: true });
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
