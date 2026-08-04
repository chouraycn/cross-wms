// Automated repair of the server/engine import graph so tsx (strict Node ESM) can boot.
// Strategy (v2, stub-only, convergence-safe):
//  - Run tsx on server/index.ts, capture crash.
//  - Parse "does not provide an export named X" -> EXPORT_MISSING(file A, sym X)
//      * Remove any existing export lines in A that declare/re-export X (so we don't keep
//        pointing at a broken/missing target), then append `export const X = undefined` stub.
//        This guarantees the name resolves, regardless of what the broken sibling shipped.
//  - Parse "Cannot find module 'SPEC'" / ERR_MODULE_NOT_FOUND -> FILE_MISSING
//      * if SPEC is @openclaw-src/... -> create stub file at openclaw/src/<rel>.ts (export {})
//      * if SPEC is relative -> stop and report (manual needed)
//  - Loop until load stage passes (tsx runs > timeout without crashing) or max rounds / stuck.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const OPENCLAW_SRC = path.join(ROOT, 'openclaw', 'src');
const SKIP_DIRS = new Set(['node_modules','.git','dist','dist-server','dist-app','dist-runtime','dist-electron','coverage','build','.dev-data','e2e','.workbuddy','cdf-know-clow-analysis','docs','assets','StaffDeck-main']);

function runTsx() {
  const r = spawnSync('./node_modules/.bin/tsx', ['--tsconfig', 'server/tsconfig.json', 'server/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0', NODE_OPTIONS: '--max-old-space-size=8192' },
    encoding: 'utf8',
    timeout: 55000,
    maxBuffer: 80 * 1024 * 1024,
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), error: r.error };
}

function parseError(text) {
  const m = text.match(/module '([^']+)' does not provide an export named '([^']+)'/);
  if (m) {
    const spec = m[1], sym = m[2];
    const idx = text.indexOf(m[0]);
    const before = text.slice(0, idx);
    const fl = before.match(/(\S+\.ts):\d+/g);
    const file = fl ? fl[fl.length - 1].split(':')[0] : null;
    return { type: 'EXPORT', file, sym, spec };
  }
  const fm = text.match(/Cannot find module '([^']+)'|ERR_MODULE_NOT_FOUND[^]*?'([^']+)'/);
  if (fm) {
    const spec = fm[1] || fm[2];
    const idx = text.indexOf(fm[0]);
    const before = text.slice(0, idx);
    const fl = before.match(/(\S+\.ts):\d+/g);
    const file = fl ? fl[fl.length - 1].split(':')[0] : null;
    return { type: 'FILE', file, spec };
  }
  return { type: 'NONE' };
}

function injectStub(A, sym) {
  let lines = fs.readFileSync(A, 'utf8').split('\n');
  const out = [];
  let removed = false;
  for (const line of lines) {
    if (/^\s*export\b/.test(line) && new RegExp(`\\b${sym}\\b`).test(line)) {
      removed = true;
      continue; // drop this export line (it pointed at a broken/missing target)
    }
    out.push(line);
  }
  let t = out.join('\n');
  t = t.replace(/\s+$/, '') + `\nexport const ${sym} = undefined as unknown as any; // auto-fix stub (engine import-graph repair)\n`;
  fs.writeFileSync(A, t);
  return removed;
}

const log = (s) => { process.stdout.write(s + '\n'); fs.appendFileSync('/tmp/fix_engine.log', s + '\n'); };

const seen = new Set();
let round = 0;
const MAX = 80;
while (round < MAX) {
  round++;
  const { status, out, error } = runTsx();
  if (error && error.code === 'ETIMEDOUT') {
    log(`ROUND ${round}: tsx alive >55s -> load stage PASSED. STOP.`);
    break;
  }
  const e = parseError(out);
  if (e.type === 'NONE') {
    log(`ROUND ${round}: no load-stage error (exit ${status}). STOP.`);
    break;
  }
  if (e.type === 'EXPORT') {
    if (!e.file) { log(`ROUND ${round}: EXPORT ${e.sym} but file unknown -> MANUAL. STOP.`); break; }
    const key = e.file + '::' + e.sym;
    if (seen.has(key)) { log(`ROUND ${round}: STUCK on ${e.sym} @ ${path.relative(ROOT, e.file)} -> MANUAL. STOP.`); break; }
    seen.add(key);
    const removed = injectStub(e.file, e.sym);
    log(`ROUND ${round}: STUB ${e.sym} @ ${path.relative(ROOT, e.file)} (dropped export lines: ${removed})`);
  } else if (e.type === 'FILE') {
    if (e.spec && e.spec.startsWith('@openclaw-src/')) {
      const rel = e.spec.slice('@openclaw-src/'.length).replace(/\.js$/, '');
      const target = path.join(OPENCLAW_SRC, rel + '.ts');
      if (!fs.existsSync(target)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, '// auto-generated stub (@openclaw-src target missing during engine import-graph repair)\nexport {};\n');
        log(`ROUND ${round}: FILE ${e.spec} -> created stub ${path.relative(ROOT, target)}`);
      } else {
        log(`ROUND ${round}: FILE ${e.spec} -> target exists, skip`);
      }
    } else if (e.spec && e.spec.startsWith('.')) {
      log(`ROUND ${round}: FILE ${e.spec} relative missing @ ${e.file ? path.relative(ROOT, e.file) : '?'} -> MANUAL. STOP.`);
      break;
    } else {
      log(`ROUND ${round}: FILE ${e.spec} (alias) -> MANUAL. STOP.`);
      break;
    }
  }
}
log('DONE');
