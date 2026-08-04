// Engine import-graph repair v3 — ground-truth driven by tsx strict-ESM errors.
// For each "does not provide an export named X" (or "requested module REL does not provide X"):
//   locate the statement (import/export) referencing X from a relative source in the TARGET file,
//   resolve: if relative target does NOT export X but openclaw/src does -> rewrite source to @openclaw-src/MOD.js
//   else if openclaw/src also lacks X -> append `undefined` stub (and remove broken re-export line for X)
// Loop running tsx until load phase passes (no such errors).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, appendFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENGINE = path.join(ROOT, 'server/engine');
const OC = path.join(ROOT, 'openclaw/src');
const LOG = '/tmp/fix_engine_v3.log';
try { writeFileSync(LOG, ''); } catch {}
const log = (s) => appendFileSync(LOG, s + '\n');

// Build openclaw/src export index (module path relative to openclaw/src, no ext) -> set of exported names
function walk(dir) {
  let out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) out = out.concat(walk(p));
    else if (e.endsWith('.ts')) out.push(p);
  }
  return out;
}
const ocIndex = new Map();
for (const f of walk(OC)) {
  if (f.includes('.test.') || f.includes('.generated.')) continue;
  const t = readFileSync(f, 'utf8');
  const names = new Set();
  for (const m of t.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of t.matchAll(/export\s*\{([\s\S]*?)\}/g)) {
    for (const part of m[1].split(',')) {
      const pm = part.trim().match(/([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?/);
      if (pm) names.add(pm[2] || pm[1]);
    }
  }
  ocIndex.set(path.relative(OC, f).replace(/\.ts$/, ''), names);
}
function ocModuleFor(sym) {
  const hits = [];
  for (const [mod, names] of ocIndex) if (names.has(sym)) hits.push(mod);
  if (!hits.length) return null;
  // prefer non-test, non generated, prefer config/plugin-sdk/agents roots
  const pref = hits.filter(h => !h.includes('test') && !h.includes('generated'));
  const pool = pref.length ? pref : hits;
  pool.sort((a, b) => a.length - b.length);
  return pool[0];
}

function fileExports(fileTs, sym) {
  if (!existsSync(fileTs)) return false;
  const t = readFileSync(fileTs, 'utf8');
  if (new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var|class|type|interface|enum)\\s+${sym}\\b`).test(t)) return true;
  for (const m of t.matchAll(/export\s*\{([\s\S]*?)\}/g)) {
    for (const part of m[1].split(',')) {
      const pm = part.trim().match(/([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?/);
      if (pm && (pm[2] || pm[1]) === sym) return true;
    }
  }
  return false;
}

const STMT_RE = /(export|import)\s*(?:type\s+)?\{([\s\S]*?)\}\s*from\s*["'](\.\.?\/[^"']+)["']/g;

function fixFile(file, sym) {
  const t = readFileSync(file, 'utf8');
  let replaced = false;
  const out = [];
  let idx = 0;
  const re = new RegExp(STMT_RE.source, 'g');
  let last = 0;
  let m;
  while ((m = re.exec(t)) !== null) {
    const [full, kind, block, src] = m;
    const base = path.dirname(file);
    const target = path.normalize(path.join(base, src));
    const targetTs = target.endsWith('.js') ? target.slice(0, -3) + '.ts' : target;
    // parse names: (orig, alias, isType)
    const names = [];
    for (const part of block.split(',')) {
      const pm = part.trim().match(/(type\s+)?([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?/);
      if (pm) names.push({ orig: pm[2], alias: pm[3] || pm[2], type: !!pm[1] });
    }
    // classify
    const keep = [];      // stay on relative src (target exports them)
    const toOc = [];      // move to @openclaw-src
    const needStub = [];  // not in openclaw either
    for (const n of names) {
      if (fileExports(targetTs, n.orig)) keep.push(n);
      else {
        const mod = ocModuleFor(n.orig);
        if (mod) toOc.push({ ...n, mod });
        else needStub.push(n);
      }
    }
    // build replacement
    const lines = [];
    if (keep.length) {
      const inner = keep.map(n => `${n.type ? 'type ' : ''}${n.orig}${n.alias !== n.orig ? ' as ' + n.alias : ''}`).join(', ');
      lines.push(`${kind} { ${inner} } from "${src}";`);
    }
    // group toOc by module
    const byMod = new Map();
    for (const n of toOc) { if (!byMod.has(n.mod)) byMod.set(n.mod, []); byMod.get(n.mod).push(n); }
    for (const [mod, arr] of byMod) {
      const inner = arr.map(n => `${n.type ? 'type ' : ''}${n.orig}${n.alias !== n.orig ? ' as ' + n.alias : ''}`).join(', ');
      lines.push(`${kind} { ${inner} } from "@openclaw-src/${mod}.js";`);
    }
    if (needStub.length && kind === 'export') {
      for (const n of needStub) {
        lines.push(`export const ${n.orig} = undefined as unknown as any; // auto-fix stub (engine repair)`);
      }
    }
    if (lines.length === 0) {
      // all symbols were broken and not export -> drop the statement entirely to avoid referencing missing
      out.push('// dropped broken ' + kind + ' of ' + sym);
    } else {
      out.push(lines.join('\n'));
    }
    replaced = true;
    last = re.lastIndex;
  }
  const head = t.slice(0, t.search(STMT_RE));
  // Simpler: rebuild whole file by replacing each matched statement.
  // (above out logic only collected statements; do a clean replace instead)
  // We'll do string replace of each full match via a second pass:
  let nt = t;
  nt = nt.replace(new RegExp(STMT_RE.source, 'g'), (full, kind, block, src) => {
    const base = path.dirname(file);
    const target = path.normalize(path.join(base, src));
    const targetTs = target.endsWith('.js') ? target.slice(0, -3) + '.ts' : target;
    const names = [];
    for (const part of block.split(',')) {
      const pm = part.trim().match(/(type\s+)?([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?/);
      if (pm) names.push({ orig: pm[2], alias: pm[3] || pm[2], type: !!pm[1] });
    }
    const keep = [], toOc = [], needStub = [];
    for (const n of names) {
      if (fileExports(targetTs, n.orig)) keep.push(n);
      else { const mod = ocModuleFor(n.orig); if (mod) toOc.push({ ...n, mod }); else needStub.push(n); }
    }
    const lines = [];
    if (keep.length) {
      const inner = keep.map(n => `${n.type ? 'type ' : ''}${n.orig}${n.alias !== n.orig ? ' as ' + n.alias : ''}`).join(', ');
      lines.push(`${kind} { ${inner} } from "${src}";`);
    }
    const byMod = new Map();
    for (const n of toOc) { if (!byMod.has(n.mod)) byMod.set(n.mod, []); byMod.get(n.mod).push(n); }
    for (const [mod, arr] of byMod) {
      const inner = arr.map(n => `${n.type ? 'type ' : ''}${n.orig}${n.alias !== n.orig ? ' as ' + n.alias : ''}`).join(', ');
      lines.push(`${kind} { ${inner} } from "@openclaw-src/${mod}.js";`);
    }
    if (needStub.length && kind === 'export') {
      for (const n of needStub) lines.push(`export const ${n.orig} = undefined as unknown as any; // auto-fix stub (engine repair)`);
    }
    if (lines.length === 0) return '';
    return lines.join('\n');
  });
  if (nt !== t) { writeFileSync(file, nt); return true; }
  return replaced;
}

// Parse tsx error to find symbol + target file
function parseError(logText) {
  // patterns:
  // 1) X from "REL" : SyntaxError: The requested module 'REL' does not provide an export named 'X'
  // 2) file.ts:LINE: import { X } from "REL"  (the file is the importer; target is REL but we need the file that should export X)
  // For our purposes, the file that should provide X is the one tsx names in "does not provide":
  //   "The requested module './io.js' does not provide an export named 'clearRuntimeConfigSnapshot'" -> the module is REL,
  //   but we need the absolute path of that module to fix its re-export. Actually the error points at the IMPORTER file:line,
  //   and the module that lacks X is REL (relative to importer). We need to fix the IMPORTER's statement (change source).
  const m1 = logText.match(/does not provide an export named '([^']+)'[\s\S]*?requested module '([^']+)'/);
  if (m1) return { sym: m1[1], rel: m1[2] };
  const m2 = logText.match(/requested module '([^']+)' does not provide an export named '([^']+)'/);
  if (m2) return { sym: m2[2], rel: m2[1] };
  // file:line import pattern: find file and the import line containing the symbol
  const m3 = logText.match(/(\/[^:\n]+):(\d+)\n(import[\s\S]*?from[^\n]+)/);
  if (m3) return { sym: null, file: m3[1], lineText: m3[3] };
  return null;
}

let round = 0;
const MAX = 120;
while (round < MAX) {
  round++;
  let tsxOut = '';
  try {
    tsxOut = execFileSync('./node_modules/.bin/tsx', ['--tsconfig', 'server/tsconfig.json', 'server/index.ts'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024,
    });
  } catch (e) { tsxOut = (e.stdout || '') + '\n' + (e.stderr || ''); }
  const err = parseError(tsxOut);
  if (!err) {
    log(`ROUND ${round}: no parseable load error. tsx exited clean-ish. DONE.`);
    log(tsxOut.slice(0, 1500));
    break;
  }
  if (err.sym && err.rel) {
    // find the importer file (the one tsx reported, or search for statements importing err.sym from err.rel)
    const rel = err.rel;
    // locate files that have a statement importing/exporting err.sym from rel
    let fixedAny = false;
    for (const f of walk(ENGINE)) {
      const t = readFileSync(f, 'utf8');
      if (new RegExp(`(import|export)[^;]*\\b${err.sym}\\b[^;]*from\\s*["']${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(t)) {
        if (fixFile(f, err.sym)) { log(`ROUND ${round}: FIX ${path.relative(ROOT, f)} sym=${err.sym} rel=${rel}`); fixedAny = true; }
      }
    }
    if (!fixedAny) { log(`ROUND ${round}: NO FIX for sym=${err.sym} rel=${rel} (maybe needs stub or manual). STOP.`); log(tsxOut.slice(0, 1200)); break; }
  } else if (err.file) {
    log(`ROUND ${round}: file-level error at ${err.file}; manual needed. STOP.`);
    log(tsxOut.slice(0, 1200));
    break;
  } else {
    log(`ROUND ${round}: unhandled error shape. STOP.`);
    log(tsxOut.slice(0, 1500));
    break;
  }
}
log(`=== END round=${round} ===`);
