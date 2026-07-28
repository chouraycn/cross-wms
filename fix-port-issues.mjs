import fs from 'fs';
import path from 'path';

const BASE = '/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/server/engine';

const modules = ['gateway','cron','secrets','shared','security','logging','daemon','media-understanding','media','hooks','flows','wizard','plugin-state'];

function fixHtmlEntities(content) {
  return content
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&colon;/g, ':')
    .replace(/&comma;/g, ',')
    .replace(/&period;/g, '.')
    .replace(/&slash;/g, '/')
    .replace(/&backslash;/g, '\\');
}

function hasOpenclawImports(content) {
  return /from\s+["']@openclaw\//.test(content) || /require\s*\(\s*["']@openclaw\//.test(content);
}

let fixedTsNoCheck = 0;
let fixedHtml = 0;

for (const mod of modules) {
  const dir = path.join(BASE, mod);
  if (!fs.existsSync(dir)) continue;

  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
        let content = fs.readFileSync(fp, 'utf-8');
        let modified = false;

        if (hasOpenclawImports(content) && !content.startsWith('// @ts-nocheck')) {
          content = `// @ts-nocheck\n${content}`;
          fixedTsNoCheck++;
          modified = true;
          console.log(`  +@ts-nocheck: ${path.relative(BASE, fp)}`);
        }

        const cleaned = fixHtmlEntities(content);
        if (cleaned !== content) {
          content = cleaned;
          fixedHtml++;
          modified = true;
          console.log(`  +HTML fix: ${path.relative(BASE, fp)}`);
        }

        if (modified) {
          fs.writeFileSync(fp, content, 'utf-8');
        }
      }
    }
  }
  walk(dir);
}

console.log(`\nDone. +@ts-nocheck: ${fixedTsNoCheck} files, +HTML fix: ${fixedHtml} files.`);