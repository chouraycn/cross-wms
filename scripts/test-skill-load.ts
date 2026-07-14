import { loadSkills } from '../server/engine/skillLoader.js';
import { resolveSkillScanDirs } from '../server/engine/skillRuntimeBridge.js';
import fs from 'fs';

async function main() {
  const dirs = resolveSkillScanDirs();
  console.log('Scan dirs:', dirs.map(d => `${d.source}: ${d.dir}`));

  let totalLoaded = 0;
  let totalFailed = 0;

  for (const { dir, source } of dirs) {
    if (!fs.existsSync(dir)) {
      console.log(`SKIP (not exist): ${dir}`);
      continue;
    }
    console.log(`\n=== Loading from ${source}: ${dir} ===`);
    const result = await loadSkills({ source, directory: dir });
    console.log('Result:', result);
    totalLoaded += result.loaded;
    totalFailed += result.failed;
  }

  console.log(`\n=== TOTAL: loaded=${totalLoaded}, failed=${totalFailed} ===`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
