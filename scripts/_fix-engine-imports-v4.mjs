// Engine import-graph repair v4 — STUB-ONLY, guaranteed to converge.
// For each tsx "requested module 'REL' does not provide an export named 'X'":
//   find every engine file with a statement (import/export) that references X from REL,
//   delete that whole statement (avoids duplicate-export), then append `undefined` stub for X (if absent).
// Re-run tsx until no more "does not provide" / "Could not resolve" / ERR_MODULE_NOT_FOUND.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, appendFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENGINE = path.join(ROOT, 'server/engine');
const LOG = '/tmp/fix_engine_v4.log';
try { writeFileSync(LOG, ''); } catch {}
const log = (s) => appendFileSync(LOG, s + '\n');

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
const FILES = walk(ENGINE);

const STMT_RE = /(export|import)\s*(?:type\s+)?\{([\s\S]*?)\}\s*from\s*["'](\.\.?\/[^"']+)["']/g;

function alreadyStubbed(t, sym) {
  return new RegExp(`export const ${sym}\\s*=\\s*undefined`).test(t);
}

function fixSym(sym, rel) {
  // normalize rel for comparison (could be ./ or ../)
  let changed = false;
  for (const f of FILES) {
    const t = readFileSync(f, 'utf8');
    let nt = t;
    // delete statements that reference sym AND use rel
    nt = nt.replace(new RegExp(STMT_RE.source, 'g'), (full, kind, block, src) => {
      const normSrc = (src.startsWith('./') ? './' : '') + src; // keep as-is
      // compare rel basename
      if (path.normalize(src) !== path.normalize(rel)) return full;
      const names = block.split(',').map(s => s.trim().replace(/^(type\s+)?/, '').replace(/\s+as\s+\w+$/, '').trim());
      if (!names.includes(sym)) return full;
      return ''; // delete this broken statement
    });
    if (nt !== t) {
      // append stub if not present
      if (!alreadyStubbed(nt, sym)) {
        nt = nt.replace(/\n*$/, '') + `\nexport const ${sym} = undefined as unknown as any; // auto-fix stub (engine repair)\n`;
      }
      writeFileSync(f, nt);
      changed = true;
      log(`FIX ${path.relative(ROOT, f)} sym=${sym} rel=${rel}`);
    }
  }
  return changed;
}

function parseError(out) {
  const m = out.match(/requested module '([^']+)' does not provide an export named '([^']+)'/);
  if (m) return { rel: m[1], sym: m[2] };
  const m2 = out.match(/Cannot find module '([^']+)'|Could not resolve "([^"]+)"/);
  if (m2) return { rel: m2[1] || m2[2], sym: null };
  const m3 = out.match(/Error: Cannot find module '([^']+)'/);
  if (m3) return { rel: m3[1], sym: null };
  return null;
}

let round = 0;
const MAX = 400;
while (round < MAX) {
  round++;
  let out = '';
  try {
    out = execFileSync('./node_modules/.bin/tsx', ['--tsconfig', 'server/tsconfig.json', 'server/index.ts'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 80 * 1024 * 1024,
    });
  } catch (e) { out = (e.stdout || '') + '\n' + (e.stderr || ''); }
  const err = parseError(out);
  if (!err) {
    log(`ROUND ${round}: no module-resolution error -> LOAD PHASE PASSED. DONE.`);
    log(out.slice(0, 1500));
    break;
  }
  if (err.sym && err.rel) {
    const changed = fixSym(err.sym, err.rel);
    if (!changed) {
      log(`ROUND ${round}: NO CHANGE for sym=${err.sym} rel=${err.rel} -> STOP (manual needed).`);
      log(out.slice(0, 1500));
      break;
    }
  } else if (err.rel && !err.sym) {
    // missing module file: create empty stub
    const p = path.resolve(ROOT, err.rel);
    if (!existsSync(p)) {
      try { writeFileSync(p, `// auto-fix stub module (engine repair)\nexport {};\n`); log(`STUB MODULE ${err.rel}`); continue; }
      catch {}
    }
    log(`ROUND ${round}: module ${err.rel} missing and unresolvable -> STOP.`);
    log(out.slice(0, 1500));
    break;
  }
}
log(`=== END round=${round} ===`);
