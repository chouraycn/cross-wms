#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');

const args = process.argv.slice(2);
const bumpType = args[0] || 'patch';

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
  return pkg.version;
}

function writeVersion(version) {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
  pkg.version = version;
  fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + '\n');
}

function bumpVersion(currentVersion, type) {
  const parts = currentVersion.split('.').map(Number);
  if (parts.length !== 3) {
    throw new Error(`Invalid version format: ${currentVersion}`);
  }
  
  switch (type) {
    case 'major':
      parts[0] += 1;
      parts[1] = 0;
      parts[2] = 0;
      break;
    case 'minor':
      parts[1] += 1;
      parts[2] = 0;
      break;
    case 'patch':
      parts[2] += 1;
      break;
    default:
      throw new Error(`Unknown bump type: ${type}`);
  }
  
  return parts.join('.');
}

function main() {
  try {
    const currentVersion = readVersion();
    const newVersion = bumpVersion(currentVersion, bumpType);
    writeVersion(newVersion);
    console.log(`Version bumped: ${currentVersion} → ${newVersion}`);
    process.exit(0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { bumpVersion, readVersion, writeVersion };
