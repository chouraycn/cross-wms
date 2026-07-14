import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

const testFiles = [
  'openclaw/skills/gh-issues/SKILL.md',
  'openclaw/skills/weather/SKILL.md',
  'openclaw/skills/apple-notes/SKILL.md',
];

for (const file of testFiles) {
  if (!fs.existsSync(file)) {
    console.log(`SKIP (not found): ${file}`);
    continue;
  }
  const content = fs.readFileSync(file, 'utf-8');
  const trimmed = content.trimStart();
  const fmMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    console.log(`NO FRONTMATTER: ${file}`);
    continue;
  }

  const frontmatterText = fmMatch[1];
  console.log(`\n=== ${file} ===`);
  console.log('Frontmatter text (first 300 chars):');
  console.log(frontmatterText.slice(0, 300));

  console.log('\n--- Trying js-yaml parse ---');
  try {
    const parsed = yaml.load(frontmatterText, { schema: yaml.DEFAULT_SCHEMA, json: true });
    console.log('Parsed type:', typeof parsed, Array.isArray(parsed) ? '(array)' : '');
    if (parsed && typeof parsed === 'object') {
      console.log('Keys:', Object.keys(parsed));
      if (parsed.metadata) {
        console.log('metadata type:', typeof parsed.metadata);
        if (typeof parsed.metadata === 'string') {
          console.log('metadata is STRING, trying JSON.parse...');
          try {
            const metadataObj = JSON.parse(parsed.metadata);
            console.log('metadata parsed:', JSON.stringify(metadataObj, null, 2));
          } catch (e) {
            console.error('metadata JSON parse failed:', e.message);
          }
        } else {
          console.log('metadata:', JSON.stringify(parsed.metadata, null, 2));
        }
      }
    }
  } catch (err) {
    console.error('YAML parse error:', err.message);
  }
}
