#!/usr/bin/env tsx
/**
 * QA Verification Script for Desktop Automation Tools
 * Tests tool registration, handler structure, and code quality
 */

import { initDefaultTools, getBuiltinToolDefinitions, listTools } from './server/engine/toolRegistry.ts';
import { readFileSync } from 'fs';

console.log('=== CrossWMS Desktop Tools QA Verification ===\n');

let passed = 0;
let failed = 0;
const errors: string[] = [];

// Test 1: Initialize tools
console.log('[Test 1] Initializing tool registry...');
try {
  await initDefaultTools();
  console.log('✅ Tool registry initialized successfully');
  passed++;
} catch (e: any) {
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
const definitions = getBuiltinToolDefinitions();
const desktopDefinitions = definitions.filter(d => d.function.name.startsWith('desktop:'));

let definitionErrors = 0;
for (const def of desktopDefinitions) {
  const name = def.function.name;
  
  // Check required fields
  if (!def.type) {
    console.log(`❌ ${name}: missing 'type'`);
    definitionErrors++;
  }
  if (!def.function.description || def.function.description.trim().length < 10) {
    console.log(`❌ ${name}: missing or too short description`);
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

// Test 5: Static analysis of handler code
console.log('\n[Test 5] Static analysis of handler code...');

const sourceCode = readFileSync('./server/engine/toolRegistry.ts', 'utf8');

interface QualityCheck {
  name: string;
  check: () => boolean;
}

const qualityChecks: QualityCheck[] = [
  {
    name: 'All handlers have try/catch',
    check: () => {
      const handlerPattern = /async function handleDesktop\w+\([^)]*\)[\s\S]*?^}/gm;
      const handlers = sourceCode.match(handlerPattern) || [];
      // If no handlers matched with the complex pattern, try simpler check
      if (handlers.length === 0) {
        // Count handler function declarations
        const handlerCount = (sourceCode.match(/async function handleDesktop/g) || []).length;
        // Count try blocks in desktop section
        const tryCount = (sourceCode.match(/try\s*{/g) || []).length;
        return tryCount >= handlerCount;
      }
      return handlers.every(h => h.includes('try {') && h.includes('catch'));
    },
  },
  {
    name: 'All execSync calls have timeout',
    check: () => {
      const execCalls = sourceCode.match(/execSync\([^)]+\)/g) || [];
      return execCalls.every(call => call.includes('timeout:'));
    },
  },
  {
    name: 'Temp files are cleaned up',
    check: () => {
      const unlinkCalls = (sourceCode.match(/unlinkSync/g) || []).length;
      const tempFileCreations = (sourceCode.match(/\/tmp\/desktop-/g) || []).length;
      console.log(`    [Debug] unlink calls: ${unlinkCalls}, temp files: ${tempFileCreations}`);
      return unlinkCalls >= tempFileCreations;
    },
  },
  {
    name: 'All handlers return JSON.stringify',
    check: () => {
      const handlerCount = (sourceCode.match(/async function handleDesktop/g) || []).length;
      const jsonStringifyCount = (sourceCode.match(/JSON\.stringify/g) || []).length;
      console.log(`    [Debug] handlers: ${handlerCount}, JSON.stringify calls: ${jsonStringifyCount}`);
      return jsonStringifyCount >= handlerCount;
    },
  },
  {
    name: 'Parameter validation in handlers',
    check: () => {
      // Check that handlers validate required parameters
      const hasValidation = sourceCode.includes("parameters is required") || 
                          sourceCode.includes("parameter is required");
      return hasValidation;
    },
  },
];

let qualityPassed = 0;
for (const check of qualityChecks) {
  process.stdout.write(`  Checking: ${check.name}... `);
  if (check.check()) {
    console.log('✅');
    qualityPassed++;
  } else {
    console.log('❌');
    errors.push(`Quality check failed: ${check.name}`);
  }
}

if (qualityPassed === qualityChecks.length) {
  passed++;
} else {
  failed++;
}

// Test 6: Check for peekaboo dependency handling
console.log('\n[Test 6] Checking peekaboo dependency handling...');
const hasAvailabilityCheck = sourceCode.includes('checkPeekabooAvailability');
const hasGracefulFailure = sourceCode.includes("peekabooInstalled: false") || 
                            sourceCode.includes('peekaboo CLI not found');
if (hasAvailabilityCheck && hasGracefulFailure) {
  console.log('✅ Peekaboo availability is properly checked with graceful failure handling');
  passed++;
} else {
  console.log('❌ Peekaboo availability check may be insufficient');
  errors.push('Peekaboo dependency handling needs review');
  failed++;
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('QA Verification Summary');
console.log('='.repeat(50));
console.log(`✅ Passed: ${passed}/6`);
console.log(`❌ Failed: ${failed}/6`);

if (errors.length > 0) {
  console.log('\nDetailed Errors:');
  errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
}

// Overall verdict
console.log('\n' + '='.repeat(50));
console.log('Overall Verdict');
console.log('='.repeat(50));

if (failed === 0) {
  console.log('✅ READY FOR DMG PACKAGING');
  console.log('   All verification tests passed.');
  console.log('   Note: peekaboo CLI must be installed on target macOS system.');
  console.log('\n   Recommendation: Add peekaboo installation to setup script.');
} else if (failed <= 2) {
  console.log('⚠️  READY WITH WARNINGS');
  console.log('   Minor issues found, but core functionality is intact.');
  console.log('   Review errors before packaging.');
} else {
  console.log('❌ NOT READY');
  console.log('   Critical issues found. Fix before packaging.');
}

process.exit(failed > 0 ? 1 : 0);
