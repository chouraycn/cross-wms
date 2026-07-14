import { parseSkillMdToDefinition } from './server/engine/skillRegistry.js';
import fs from 'fs';

const mdPath = '/Users/chouray/Library/Application Support/CDFKnowClow/skills/hscode-assistant/SKILL.md';
const content = fs.readFileSync(mdPath, 'utf-8');
const definition = parseSkillMdToDefinition(content, '/Users/chouray/Library/Application Support/CDFKnowClow/skills/hscode-assistant', 'builtin');

console.log('=== parseSkillMdToDefinition 结果 ===');
console.log('id:', definition?.id);
console.log('name:', definition?.name);
console.log('trigger:', definition?.trigger);
console.log('triggers:', definition?.triggers);
console.log('tags:', definition?.tags);