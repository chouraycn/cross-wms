#!/usr/bin/env node

import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import('../dist/index.js').catch(error => {
  console.error('Failed to load CLI:', error);
  process.exit(1);
});