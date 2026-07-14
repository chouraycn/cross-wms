import { getUserSkills, getUserSkillById, getBuiltinPatches } from '../server/dao/skills.js';

try {
  const skills = getUserSkills();
  console.log('User skills count:', skills.length);
  console.log('First skill:', skills[0]);

  const patches = getBuiltinPatches();
  console.log('Builtin patches:', patches);
} catch (e) {
  console.error('Error:', e);
}
