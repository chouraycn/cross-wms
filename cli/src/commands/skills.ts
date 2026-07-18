import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';

/** 技能目录列表 */
function getSkillDirs(): string[] {
  return [
    path.join(process.cwd(), 'skills'),
    path.join(process.cwd(), 'src', 'skills'),
  ];
}

/** 扫描技能目录 */
async function scanSkills(): Promise<
  Array<{
    name: string;
    path: string;
    description?: string;
    version?: string;
  }>
> {
  const results = [];
  for (const dir of getSkillDirs()) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillPath = path.join(dir, entry.name);
        const skillMd = path.join(skillPath, 'SKILL.md');
        try {
          await fs.access(skillMd);
          const content = await fs.readFile(skillMd, 'utf-8');
          // 简单解析 frontmatter 或标题
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const descMatch = content.match(/^description:\s*(.+)$/m);
          const versionMatch = content.match(/^version:\s*(.+)$/m);
          results.push({
            name: entry.name,
            path: skillPath,
            description: descMatch?.[1] ?? titleMatch?.[1] ?? undefined,
            version: versionMatch?.[1] ?? undefined,
          });
        } catch {
          // 没有 SKILL.md
          results.push({
            name: entry.name,
            path: skillPath,
          });
        }
      }
    } catch {
      // 目录不存在
    }
  }
  return results;
}

/** 读取技能详情 */
async function readSkillDetail(skillName: string): Promise<string | null> {
  for (const dir of getSkillDirs()) {
    const skillMd = path.join(dir, skillName, 'SKILL.md');
    try {
      const content = await fs.readFile(skillMd, 'utf-8');
      return content;
    } catch {
      // 继续尝试下一个目录
    }
  }
  return null;
}

export const skillsCommand = new Command('skills')
  .description('管理技能')
  .version('1.0.0');

// list 子命令
skillsCommand
  .command('list')
  .description('列出所有技能')
  .action(async () => {
    const skills = await scanSkills();

    console.log('技能列表:');
    console.log('');
    for (const skill of skills) {
      console.log(`  ${skill.name}`);
      if (skill.description) {
        console.log(`    描述: ${skill.description}`);
      }
      if (skill.version) {
        console.log(`    版本: ${skill.version}`);
      }
      console.log(`    路径: ${skill.path}`);
      console.log('');
    }
    console.log(`共 ${skills.length} 个技能`);
  });

// show 子命令
skillsCommand
  .command('show <skillName>')
  .description('显示某个技能的详细信息')
  .action(async (skillName: string) => {
    const content = await readSkillDetail(skillName);
    if (content) {
      console.log(`技能: ${skillName}`);
      console.log('');
      console.log(content);
    } else {
      console.log(`技能 ${skillName} 未找到`);
    }
  });
