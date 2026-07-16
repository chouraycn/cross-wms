import fs from 'fs';
import path from 'path';
import { parseSkillMdWithMetadata } from './skillMetadata';
import { checkSkillDependencies, generateInstallCommands } from './dependencyChecker';
import { auditSkillDirectory } from './securityAuditor';

export interface InstallOptions {
  overwrite?: boolean;
  skipDependencies?: boolean;
  runAudit?: boolean;
}

export interface InstallResult {
  success: boolean;
  skillId: string;
  skillName: string;
  directory: string;
  copiedFiles: number;
  dependencyCheck?: {
    allSatisfied: boolean;
    missingBins: string[];
    missingEnv: string[];
    installCommands: string[];
  };
  audit?: {
    score: number;
    level: 'pass' | 'warning' | 'fail';
    issues: string[];
  };
  error?: string;
}

export interface UninstallResult {
  success: boolean;
  skillId: string;
  deletedDirectory: string;
  deletedFiles: number;
  error?: string;
}

export interface UpdateResult {
  success: boolean;
  skillId: string;
  oldVersion: string;
  newVersion: string;
  updatedFiles: number;
  error?: string;
}

export class SkillLifecycle {
  private skillsDir: string;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }
  }

  async install(sourceDir: string, options: InstallOptions = {}): Promise<InstallResult> {
    const { overwrite = false, skipDependencies = false, runAudit = false } = options;

    try {
      if (!fs.existsSync(sourceDir)) {
        return {
          success: false,
          skillId: '',
          skillName: '',
          directory: '',
          copiedFiles: 0,
          error: '源目录不存在',
        };
      }

      const skillMdPath = path.join(sourceDir, 'SKILL.md');
      const skillMdLowerPath = path.join(sourceDir, 'skill.md');
      let skillId: string;
      let skillName: string;

      if (fs.existsSync(skillMdPath)) {
        const parsed = parseSkillMdWithMetadata(fs.readFileSync(skillMdPath, 'utf-8'));
        skillId = parsed.name ? sanitizeId(parsed.name) : path.basename(sourceDir);
        skillName = parsed.name || path.basename(sourceDir);
      } else if (fs.existsSync(skillMdLowerPath)) {
        const parsed = parseSkillMdWithMetadata(fs.readFileSync(skillMdLowerPath, 'utf-8'));
        skillId = parsed.name ? sanitizeId(parsed.name) : path.basename(sourceDir);
        skillName = parsed.name || path.basename(sourceDir);
      } else {
        skillId = path.basename(sourceDir);
        skillName = path.basename(sourceDir);
      }

      const targetDir = path.join(this.skillsDir, skillId);

      if (fs.existsSync(targetDir)) {
        if (!overwrite) {
          return {
            success: false,
            skillId,
            skillName,
            directory: targetDir,
            copiedFiles: 0,
            error: '技能已存在，需要使用 overwrite 选项',
          };
        }
        fs.rmSync(targetDir, { recursive: true, force: true });
      }

      fs.mkdirSync(targetDir, { recursive: true });

      let copiedFiles = 0;
      const copyDir = (src: string, dest: string) => {
        const items = fs.readdirSync(src, { withFileTypes: true });
        for (const item of items) {
          const srcPath = path.join(src, item.name);
          const destPath = path.join(dest, item.name);
          if (item.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyDir(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
            copiedFiles++;
          }
        }
      };
      copyDir(sourceDir, targetDir);

      const result: InstallResult = {
        success: true,
        skillId,
        skillName,
        directory: targetDir,
        copiedFiles,
      };

      if (!skipDependencies) {
        const mdPath = fs.existsSync(skillMdPath) ? skillMdPath : skillMdLowerPath;
        if (fs.existsSync(mdPath)) {
          const parsed = parseSkillMdWithMetadata(fs.readFileSync(mdPath, 'utf-8'));
          const requires = parsed.metadata?.requires || parsed.openclaw?.requires;
          const installSteps = parsed.metadata?.install || [];
          const depCheck = await checkSkillDependencies(skillId, skillName, requires, installSteps);
          result.dependencyCheck = {
            allSatisfied: depCheck.allSatisfied,
            missingBins: depCheck.missingBins,
            missingEnv: depCheck.missingEnv,
            installCommands: generateInstallCommands(installSteps),
          };
        }
      }

      if (runAudit) {
        const audit = auditSkillDirectory(skillId, targetDir);
        result.audit = {
          score: audit.score,
          level: audit.level,
          issues: audit.issues.map(i => `${i.severity}: ${i.message}`),
        };
      }

      return result;
    } catch (err) {
      return {
        success: false,
        skillId: '',
        skillName: '',
        directory: '',
        copiedFiles: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  uninstall(skillId: string): UninstallResult {
    try {
      const targetDir = path.join(this.skillsDir, skillId);

      if (!fs.existsSync(targetDir)) {
        return {
          success: false,
          skillId,
          deletedDirectory: '',
          deletedFiles: 0,
          error: '技能目录不存在',
        };
      }

      let deletedFiles = 0;
      const countFiles = (dir: string) => {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          if (item.isDirectory()) {
            countFiles(fullPath);
          } else {
            deletedFiles++;
          }
        }
      };
      countFiles(targetDir);

      fs.rmSync(targetDir, { recursive: true, force: true });

      return {
        success: true,
        skillId,
        deletedDirectory: targetDir,
        deletedFiles,
      };
    } catch (err) {
      return {
        success: false,
        skillId,
        deletedDirectory: '',
        deletedFiles: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  update(skillId: string, sourceDir: string): UpdateResult {
    try {
      const targetDir = path.join(this.skillsDir, skillId);

      if (!fs.existsSync(targetDir)) {
        return {
          success: false,
          skillId,
          oldVersion: '',
          newVersion: '',
          updatedFiles: 0,
          error: '技能目录不存在',
        };
      }

      if (!fs.existsSync(sourceDir)) {
        return {
          success: false,
          skillId,
          oldVersion: '',
          newVersion: '',
          updatedFiles: 0,
          error: '源目录不存在',
        };
      }

      const oldMdPath = path.join(targetDir, 'SKILL.md');
      const oldMdLowerPath = path.join(targetDir, 'skill.md');
      const newMdPath = path.join(sourceDir, 'SKILL.md');
      const newMdLowerPath = path.join(sourceDir, 'skill.md');

      let oldVersion = 'unknown';
      if (fs.existsSync(oldMdPath)) {
        const parsed = parseSkillMdWithMetadata(fs.readFileSync(oldMdPath, 'utf-8'));
        oldVersion = parsed.version || 'unknown';
      } else if (fs.existsSync(oldMdLowerPath)) {
        const parsed = parseSkillMdWithMetadata(fs.readFileSync(oldMdLowerPath, 'utf-8'));
        oldVersion = parsed.version || 'unknown';
      }

      let newVersion = 'unknown';
      if (fs.existsSync(newMdPath)) {
        const parsed = parseSkillMdWithMetadata(fs.readFileSync(newMdPath, 'utf-8'));
        newVersion = parsed.version || 'unknown';
      } else if (fs.existsSync(newMdLowerPath)) {
        const parsed = parseSkillMdWithMetadata(fs.readFileSync(newMdLowerPath, 'utf-8'));
        newVersion = parsed.version || 'unknown';
      }

      fs.rmSync(targetDir, { recursive: true, force: true });
      fs.mkdirSync(targetDir, { recursive: true });

      let updatedFiles = 0;
      const copyDir = (src: string, dest: string) => {
        const items = fs.readdirSync(src, { withFileTypes: true });
        for (const item of items) {
          const srcPath = path.join(src, item.name);
          const destPath = path.join(dest, item.name);
          if (item.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyDir(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
            updatedFiles++;
          }
        }
      };
      copyDir(sourceDir, targetDir);

      return {
        success: true,
        skillId,
        oldVersion,
        newVersion,
        updatedFiles,
      };
    } catch (err) {
      return {
        success: false,
        skillId,
        oldVersion: '',
        newVersion: '',
        updatedFiles: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  list(): Array<{ id: string; name: string; version: string; directory: string; exists: boolean }> {
    const result: Array<{ id: string; name: string; version: string; directory: string; exists: boolean }> = [];

    if (!fs.existsSync(this.skillsDir)) return result;

    const processDir = (dirPath: string, prefix = '') => {
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;

          const fullPath = path.join(dirPath, entry.name);
          const skillId = prefix ? `${prefix}/${entry.name}` : entry.name;
          const skillMdPath = path.join(fullPath, 'SKILL.md');
          const skillMdLowerPath = path.join(fullPath, 'skill.md');

          let name = entry.name;
          let version = '1.0.0';

          if (fs.existsSync(skillMdPath)) {
            const parsed = parseSkillMdWithMetadata(fs.readFileSync(skillMdPath, 'utf-8'));
            name = parsed.name || entry.name;
            version = parsed.version || '1.0.0';
          } else if (fs.existsSync(skillMdLowerPath)) {
            const parsed = parseSkillMdWithMetadata(fs.readFileSync(skillMdLowerPath, 'utf-8'));
            name = parsed.name || entry.name;
            version = parsed.version || '1.0.0';
          }

          result.push({
            id: skillId,
            name,
            version,
            directory: fullPath,
            exists: true,
          });
        }
      } catch {
      }
    };

    processDir(this.skillsDir);

    const importedDir = path.join(this.skillsDir, '_imported');
    if (fs.existsSync(importedDir)) {
      const importerEntries = fs.readdirSync(importedDir, { withFileTypes: true });
      for (const importer of importerEntries) {
        if (!importer.isDirectory()) continue;
        if (importer.name.startsWith('.')) continue;
        processDir(path.join(importedDir, importer.name), importer.name);
      }
    }

    return result;
  }

  exists(skillId: string): boolean {
    return fs.existsSync(path.join(this.skillsDir, skillId));
  }
}

function sanitizeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
