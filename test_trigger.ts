import { parseSkillMdContent } from './server/services/skillMdParser.js';
import fs from 'fs';

const mdPath = '/Users/chouray/Library/Application Support/CDFKnowClow/skills/hscode-assistant/SKILL.md';
const content = fs.readFileSync(mdPath, 'utf-8');
const parsed = parseSkillMdContent(content);

console.log('=== 解析结果 ===');
console.log('trigger:', parsed.frontmatter.trigger);
console.log('triggers:', parsed.frontmatter.triggers);
console.log('tags:', parsed.frontmatter.tags);
console.log('name:', parsed.frontmatter.name);