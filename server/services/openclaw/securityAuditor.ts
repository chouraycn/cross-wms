import fs from 'fs';
import path from 'path';
import { parseSkillMdWithMetadata } from './skillMetadata';

export interface AuditIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  code: string;
  message: string;
  location?: string;
  suggestion?: string;
}

export interface SkillAuditResult {
  skillId: string;
  skillName: string;
  score: number;
  level: 'pass' | 'warning' | 'fail';
  issues: AuditIssue[];
  hasSkillMd: boolean;
  hasScripts: boolean;
  hasBinaries: boolean;
  fileCount: number;
  suspiciousPatterns: string[];
}

const SUSPICIOUS_PATTERNS = [
  /rm\s+-rf\s+/,
  /sudo\s+/,
  /chmod\s+777/,
  /curl.*\|.*sh/,
  /wget.*\|.*sh/,
  /\$\(curl/,
  /\$\(wget/,
  /eval\s+/,
  /exec\s+/,
  /cat\s+\/etc\/passwd/,
  /cat\s+\/etc\/shadow/,
  /touch\s+\/tmp\/.*sock/,
  /bind\s+0\.0\.0\.0/,
  /listen\s+0\.0\.0\.0/,
];

const DANGEROUS_DIRECTORIES = ['bin', '.bin', 'scripts'];
const DANGEROUS_EXTENSIONS = ['.sh', '.py', '.js', '.mjs', '.cjs', '.exe', '.dylib', '.so'];

export function auditSkillDirectory(skillId: string, skillDir: string): SkillAuditResult {
  const issues: AuditIssue[] = [];
  const suspiciousPatterns: string[] = [];
  let fileCount = 0;
  let hasSkillMd = false;
  let hasScripts = false;
  let hasBinaries = false;

  if (!fs.existsSync(skillDir)) {
    return {
      skillId,
      skillName: skillId,
      score: 0,
      level: 'fail',
      issues: [{ severity: 'critical', code: 'DIR_NOT_FOUND', message: '技能目录不存在' }],
      hasSkillMd: false,
      hasScripts: false,
      hasBinaries: false,
      fileCount: 0,
      suspiciousPatterns: [],
    };
  }

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const skillMdLowerPath = path.join(skillDir, 'skill.md');

  if (fs.existsSync(skillMdPath)) {
    hasSkillMd = true;
    auditSkillMdFile(skillMdPath, issues);
  } else if (fs.existsSync(skillMdLowerPath)) {
    hasSkillMd = true;
    auditSkillMdFile(skillMdLowerPath, issues);
  } else {
    issues.push({ severity: 'high', code: 'NO_SKILL_MD', message: '缺少 SKILL.md 文件', suggestion: '创建 SKILL.md 文件描述技能元数据' });
  }

  const scanDir = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (DANGEROUS_DIRECTORIES.includes(entry.name)) {
            if (entry.name === 'bin') hasBinaries = true;
            else hasScripts = true;
            issues.push({
              severity: 'medium',
              code: 'DANGEROUS_DIR',
              message: `存在危险目录: ${entry.name}`,
              location: fullPath,
              suggestion: '检查目录内容，确保无恶意脚本或二进制文件',
            });
          }
          scanDir(fullPath);
        } else {
          fileCount++;
          const ext = path.extname(entry.name).toLowerCase();
          if (DANGEROUS_EXTENSIONS.includes(ext)) {
            if (ext === '.exe' || ext === '.dylib' || ext === '.so') hasBinaries = true;
            else hasScripts = true;

            issues.push({
              severity: 'medium',
              code: 'DANGEROUS_FILE',
              message: `存在可执行文件: ${entry.name}`,
              location: fullPath,
              suggestion: '检查文件内容，确保无恶意代码',
            });

            scanFileForSuspiciousPatterns(fullPath, suspiciousPatterns);
          }
        }
      }
    } catch {
    }
  };

  scanDir(skillDir);

  const score = calculateScore(issues);
  const level = getAuditLevel(score);

  return {
    skillId,
    skillName: skillId,
    score,
    level,
    issues,
    hasSkillMd,
    hasScripts,
    hasBinaries,
    fileCount,
    suspiciousPatterns,
  };
}

function auditSkillMdFile(filePath: string, issues: AuditIssue[]): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSkillMdWithMetadata(content);

    if (!parsed.name) {
      issues.push({ severity: 'low', code: 'MISSING_NAME', message: 'SKILL.md 缺少 name 字段', suggestion: '添加 name 字段描述技能名称' });
    }

    if (!parsed.description) {
      issues.push({ severity: 'low', code: 'MISSING_DESCRIPTION', message: 'SKILL.md 缺少 description 字段', suggestion: '添加 description 字段描述技能功能' });
    }

    if (parsed.hasError && parsed.errorMessage) {
      issues.push({ severity: 'high', code: 'YAML_ERROR', message: `SKILL.md YAML 解析错误: ${parsed.errorMessage}` });
    }

    scanFileForSuspiciousPatterns(filePath, []);
  } catch {
    issues.push({ severity: 'high', code: 'SKILL_MD_READ_ERROR', message: '无法读取 SKILL.md 文件' });
  }
}

function scanFileForSuspiciousPatterns(filePath: string, suspiciousPatterns: string[]): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(content)) {
        const matched = content.match(pattern);
        if (matched && !suspiciousPatterns.includes(matched[0])) {
          suspiciousPatterns.push(matched[0]);
        }
      }
    }
  } catch {
  }
}

function calculateScore(issues: AuditIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    switch (issue.severity) {
      case 'critical':
        score -= 30;
        break;
      case 'high':
        score -= 15;
        break;
      case 'medium':
        score -= 5;
        break;
      case 'low':
        score -= 1;
        break;
    }
  }
  return Math.max(0, score);
}

function getAuditLevel(score: number): 'pass' | 'warning' | 'fail' {
  if (score >= 80) return 'pass';
  if (score >= 50) return 'warning';
  return 'fail';
}

export function auditAllSkills(skillsDir: string): SkillAuditResult[] {
  const results: SkillAuditResult[] = [];
  if (!fs.existsSync(skillsDir)) return results;

  const processDir = (dirPath: string, prefix = '') => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;

        const fullPath = path.join(dirPath, entry.name);
        const skillId = prefix ? `${prefix}/${entry.name}` : entry.name;

        const result = auditSkillDirectory(skillId, fullPath);
        results.push(result);
      }
    } catch {
    }
  };

  processDir(skillsDir);

  const importedDir = path.join(skillsDir, '_imported');
  if (fs.existsSync(importedDir)) {
    const importerEntries = fs.readdirSync(importedDir, { withFileTypes: true });
    for (const importer of importerEntries) {
      if (!importer.isDirectory()) continue;
      if (importer.name.startsWith('.')) continue;
      processDir(path.join(importedDir, importer.name), importer.name);
    }
  }

  return results;
}
