#!/usr/bin/env node
/**
 * QA Verification Script for Desktop Automation Tools
 * Tests tool registration, handler structure, and code quality
 */

import { initDefaultTools, getToolDefinitions, listTools } from './server/engine/toolRegistry.js';

console.log('=== CrossWMS Desktop Tools QA Verification ===\n');

let passed = 0;
let failed = 0;
const errors = [];

// Test 1: Initialize tools
console.log('[Test 1] Initializing tool registry...');
try {
  initDefaultTools();
  console.log('✅ Tool registry initialized successfully');
  passed++;
} catch (e) {
  console.log('❌ Failed to initialize tool registry:', e.message);
  errors.push(`Initialization failed: ${e.message}`);
  failed++;
}

// Test 2: Count desktop tools
console.log('\n[Test 2] Counting desktop:* tools...');
const allTools = listTools();
const desktopTools = allTools.filter(t => t.startsWith('desktop:'));
console.log(`Found ${desktopTools.length} desktop tools:`, desktopTools);

if (desktopTools.length === 11) {
  console.log('✅ All 11 desktop tools registered');
  passed++;
} else {
  console.log(`❌ Expected 11 desktop tools, found ${desktopTools.length}`);
  errors.push(`Tool count mismatch: expected 11, got ${desktopTools.length}`);
  failed++;
}

// Test 3: Verify all required tools exist
console.log('\n[Test 3] Verifying all required tools...');
const requiredTools = [
  'desktop:health',
  'desktop:screenshot',
  'desktop:click',
  'desktop:type',
  'desktop:key_press',
  'desktop:app_launch',
  'desktop:app_quit',
  'desktop:window_focus',
  'desktop:clipboard',
  'desktop:scroll',
  'desktop:see',
];

const missingTools = requiredTools.filter(t => !desktopTools.includes(t));
if (missingTools.length === 0) {
  console.log('✅ All required tools are registered');
  passed++;
} else {
  console.log('❌ Missing tools:', missingTools);
  errors.push(`Missing tools: ${missingTools.join(', ')}`);
  failed++;
}

// Test 4: Check tool definitions structure
console.log('\n[Test 4] Validating tool definitions...');
const definitions = getToolDefinitions();
const desktopDefinitions = definitions.filter(d => d.function.name.startsWith('desktop:'));

let definitionErrors = 0;
for (const def of desktopDefinitions) {
  const name = def.function.name;
  
  // Check required fields
  if (!def.type) {
    console.log(`❌ ${name}: missing 'type'`);
    definitionErrors++;
  }
  if (!def.function.description) {
    console.log(`❌ ${name}: missing 'description'`);
    definitionErrors++;
  }
  if (!def.function.parameters) {
    console.log(`❌ ${name}: missing 'parameters'`);
    definitionErrors++;
  } else {
    const params = def.function.parameters;
    if (params.type !== 'object') {
      console.log(`❌ ${name}: parameters.type should be 'object'`);
      definitionErrors++;
    }
    if (!Array.isArray(params.required)) {
      console.log(`❌ ${name}: parameters.required should be an array`);
      definitionErrors++;
    }
  }
}

if (definitionErrors === 0) {
  console.log(`✅ All ${desktopDefinitions.length} tool definitions are valid`);
  passed++;
} else {
  console.log(`❌ Found ${definitionErrors} definition errors`);
  errors.push(`Definition errors: ${definitionErrors}`);
  failed++;
}

// Test 5: Code quality checks (static analysis)
console.log('\n[Test 5] Static analysis of handler code...');

// Read the source file and check for best practices
import { readFileSync } from 'fs';
const sourceCode = readFileSync('./server/engine/toolRegistry.ts', 'utf8');

const qualityChecks = [
  {
    name: 'All handlers have try/catch',
    check: () => {
      const handlers = sourceCode.match(/async function handleDesktop\w+\([^)]*\)[^{]*{[\s\S]*?^}/gm) || [];
      for (const handler of handlers) {
        if (!handler.includes('try {') || !handler.includes('catch')) {
          return false;
        }
      }
      return true;
    },
  },
  {
    name: 'All execSync calls have timeout',
    check: () => {
      const execCalls = sourceCode.match(/execSync\([^)]+\)/g) || [];
      for (const call of execCalls) {
        if (!call.includes('timeout:')) {
          return false;
        }
      }
      return true;
    },
  },
  {
    name: 'Temp files are cleaned up',
    check: () => {
      const unlinkCalls = (sourceCode.match(/unlinkSync/g) || []).length;
      const tempFiles = (sourceCode.match(/\/tmp\/desktop-/g) || []).length;
      return unlinkCalls >= tempFiles;
    },
  },
  {
    name: 'All handlers return JSON string',
    check: () => {
      const handlers = sourceCode.match(/async function handleDesktop\w+\([^)]*\)[^{]*{[\s\S]*?^}/gm) || [];
      for (const handler of handlers) {
        if (!handler.includes('JSON.stringify')) {
          return false;
        }
      }
      return true;
    },
  },
];

let qualityPassed = 0;
for (const check of qualityChecks) {
  if (check.check()) {
    console.log(`✅ ${check.name}`);
    qualityPassed++;
  } else {
    console.log(`❌ ${check.name}`);
    errors.push(`Quality check failed: ${check.name}`);
  }
}

if (qualityPassed === qualityChecks.length) {
  passed++;
} else {
  failed++;
}

// Summary
console.log('\n=== QA Verification Summary ===');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
if (errors.length > 0) {
  console.log('\nErrors:');
  errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
}

// Overall verdict
console.log('\n=== Overall Verdict ===');
if (failed === 0) {
  console.log('✅ READY FOR DMG PACKAGING');
  console.log('   All verification tests passed.');
  console.log('   Note: peekaboo CLI must be installed on target macOS system.');
} else if (failed <= 2) {
  console.log('⚠️  READY WITH WARNINGS');
  console.log('   Minor issues found, but core functionality is intact.');
  console.log('   Review errors before packaging.');
} else {
  console.log('❌ NOT READY');
  console.log('   Critical issues found. Fix before packaging.');
}

process.exit(failed > 0 ? 1 : 0);
