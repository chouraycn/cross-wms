const fs = require('fs');
const data = fs.readFileSync('/tmp/bundle-stats.json', 'utf8');
const lines = data.split('\n');

const chunks = {};
let currentChunk = null;
let currentModule = null;

for (const line of lines) {
  if (line.startsWith('assets/')) {
    currentChunk = line.replace(':', '');
    chunks[currentChunk] = { modules: {}, total: 0 };
    currentModule = null;
  } else if (line.startsWith('  /')) {
    currentModule = line.trim().replace(':', '');
    if (!chunks[currentChunk].modules[currentModule]) {
      chunks[currentChunk].modules[currentModule] = 0;
    }
  } else if (line.includes('rendered:')) {
    const size = parseInt(line.match(/rendered:\s*(\d+)/)?.[1] || '0', 10);
    if (currentModule && currentChunk) {
      chunks[currentChunk].modules[currentModule] = size;
      chunks[currentChunk].total += size;
    }
  }
}

const mainChunkKey = Object.keys(chunks).find(k => k.includes('main-'));
if (mainChunkKey) {
  const main = chunks[mainChunkKey];
  console.log(`\n=== Main Chunk 分析 (${(main.total / 1024).toFixed(1)} KB) ===\n`);
  const sorted = Object.entries(main.modules).sort((a, b) => b[1] - a[1]).slice(0, 30);
  sorted.forEach(([name, size], i) => {
    console.log(`  ${String(i+1).padStart(2)}. ${(size/1024).toFixed(1).padStart(6)} KB  ${name}`);
  });
}

console.log(`\n=== 所有 Chunk 大小排行 (Top 20) ===\n`);
const allChunks = Object.entries(chunks)
  .map(([name, data]) => [name, data.total])
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);

allChunks.forEach(([name, size], i) => {
  console.log(`  ${String(i+1).padStart(2)}. ${(size/1024).toFixed(1).padStart(7)} KB  ${name}`);
});
