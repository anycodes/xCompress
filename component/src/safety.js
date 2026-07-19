'use strict';

const fs = require('fs');
const path = require('path');

function isProperDescendant(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function nearestExistingPath(candidate) {
  let current = candidate;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

function resolveContainedPath(rootDir, requestedPath, label) {
  const root = fs.realpathSync(rootDir);
  const candidate = path.resolve(root, requestedPath);
  if (!isProperDescendant(root, candidate)) {
    throw new Error(`${label} must be inside the project directory: ${requestedPath}`);
  }

  const existing = nearestExistingPath(candidate);
  const realExisting = fs.realpathSync(existing);
  if (realExisting !== root && !isProperDescendant(root, realExisting)) {
    throw new Error(`${label} resolves outside the project directory through a symbolic link: ${requestedPath}`);
  }
  return candidate;
}

function resolveSafeOutputDir(projectDir, out) {
  return resolveContainedPath(projectDir, out || 'dist', 'output directory');
}

function resolveSafeAssetPath(projectDir, asset) {
  return resolveContainedPath(projectDir, asset, 'asset path');
}

module.exports = { resolveSafeOutputDir, resolveSafeAssetPath };
