import fs from 'fs';
import path from 'path';
import { logger } from '../../../../logger.js';
import { SessionStore } from '../store.js';
import { listSessionFiles, listArchivedSessionFiles } from '../session-file.js';
import { loadRegistry } from '../session-registry-maintenance.js';
import type { ReconciliationIssue, ReconciliationResult, ReconciliationOptions, ReconciliationStats } from './reconciliation-types.js';
import { ReconciliationStatsManager } from './reconciliation-stats.js';

export class ReconciliationEngine {
  private store: SessionStore;
  private statsManager: ReconciliationStatsManager;

  constructor(store: SessionStore) {
    this.store = store;
    const paths = store.getPaths();
    this.statsManager = new ReconciliationStatsManager(paths.baseDir);
  }

  reconcile(options: ReconciliationOptions = {}): ReconciliationResult {
    const opts = {
      autoFix: true,
      dryRun: false,
      checkOnly: false,
      ...options,
    };

    const result: ReconciliationResult = {
      success: true,
      totalChecked: 0,
      issuesFound: 0,
      issuesFixed: 0,
      issuesIgnored: 0,
      errors: [],
      issues: [],
    };

    const stats: Partial<ReconciliationStats> = {
      totalSessions: 0,
      consistentSessions: 0,
      inconsistentSessions: 0,
      missingFiles: 0,
      missingMetadata: 0,
      corruptedFiles: 0,
      duplicateEntries: 0,
      statusMismatches: 0,
      lastRun: new Date().toISOString(),
    };

    logger.info('[ReconciliationEngine] 开始数据协调...');

    try {
      const issues = this.detectIssues();
      result.issues = issues;
      result.issuesFound = issues.length;
      result.totalChecked = this.getTotalSessionCount();

      stats.totalSessions = result.totalChecked;
      stats.inconsistentSessions = issues.length;
      stats.consistentSessions = result.totalChecked - issues.length;

      this.countIssueTypes(issues, stats);

      if (!opts.checkOnly && opts.autoFix) {
        for (const issue of issues) {
          try {
            const fixed = this.fixIssue(issue, opts.dryRun);
            if (fixed) {
              result.issuesFixed++;
            } else {
              result.issuesIgnored++;
            }
          } catch (err) {
            result.errors.push(`${issue.id}: ${String(err)}`);
            logger.error('[ReconciliationEngine] 修复问题失败:', issue.id, err);
          }
        }
      }

      this.statsManager.update(stats);
      this.statsManager.incrementRunCount();

      logger.info(
        `[ReconciliationEngine] 协调完成: ${result.totalChecked} 个检查, ` +
        `${result.issuesFound} 个问题, ${result.issuesFixed} 个修复`
      );
    } catch (err) {
      result.success = false;
      result.errors.push(`协调异常: ${String(err)}`);
      logger.error('[ReconciliationEngine] 协调异常:', err);
    }

    return result;
  }

  getStats(): ReconciliationStats {
    return this.statsManager.getStats();
  }

  resetStats(): void {
    this.statsManager.reset();
  }

  private detectIssues(): ReconciliationIssue[] {
    const issues: ReconciliationIssue[] = [];

    issues.push(...this.detectMissingFiles());
    issues.push(...this.detectMissingMetadata());
    issues.push(...this.detectStatusMismatches());
    issues.push(...this.detectCorruptedFiles());
    issues.push(...this.detectDuplicateEntries());

    return issues;
  }

  private detectMissingFiles(): ReconciliationIssue[] {
    const issues: ReconciliationIssue[] = [];
    const paths = this.store.getPaths();
    const registry = loadRegistry(paths.registryFile);

    for (const entry of registry.entries) {
      const baseDir = entry.status === 'archived' ? paths.archivedDir : paths.baseDir;
      const filePath = path.join(baseDir, `${entry.sessionId}.jsonl`);

      if (!fs.existsSync(filePath)) {
        issues.push({
          id: `missing_file_${entry.sessionId}`,
          type: 'missing_file',
          sessionId: entry.sessionId,
          description: `会话文件不存在: ${filePath}`,
          severity: 'high',
          suggestedAction: 'create',
        });
      }
    }

    return issues;
  }

  private detectMissingMetadata(): ReconciliationIssue[] {
    const issues: ReconciliationIssue[] = [];

    const activeSessions = this.store.listSessions({ status: 'active' }).sessions;
    const archivedSessions = this.store.listSessions({ status: 'archived' }).sessions;

    for (const session of [...activeSessions, ...archivedSessions]) {
      if (!session.title || !session.createdAt) {
        issues.push({
          id: `missing_metadata_${session.id}`,
          type: 'missing_metadata',
          sessionId: session.id,
          description: `会话元数据不完整: ${session.id}`,
          severity: 'medium',
          suggestedAction: 'update',
        });
      }
    }

    return issues;
  }

  private detectStatusMismatches(): ReconciliationIssue[] {
    const issues: ReconciliationIssue[] = [];
    const paths = this.store.getPaths();

    const activeFiles = new Set(listSessionFiles(paths.baseDir));
    const archivedFiles = new Set(listArchivedSessionFiles(paths.archivedDir));

    const allSessions = this.store.listSessions().sessions;

    for (const session of allSessions) {
      const isActiveInStore = activeFiles.has(session.id);
      const isArchivedInStore = archivedFiles.has(session.id);

      if (session.status === 'active' && !isActiveInStore && !isArchivedInStore) {
        issues.push({
          id: `status_mismatch_${session.id}`,
          type: 'inconsistent_status',
          sessionId: session.id,
          description: `状态为 active 但文件不存在`,
          severity: 'high',
          suggestedAction: 'update',
        });
      } else if (session.status === 'archived' && !isArchivedInStore && !isActiveInStore) {
        issues.push({
          id: `status_mismatch_${session.id}`,
          type: 'inconsistent_status',
          sessionId: session.id,
          description: `状态为 archived 但文件不存在`,
          severity: 'high',
          suggestedAction: 'update',
        });
      } else if (session.status === 'active' && isArchivedInStore && !isActiveInStore) {
        issues.push({
          id: `status_mismatch_${session.id}`,
          type: 'inconsistent_status',
          sessionId: session.id,
          description: `状态为 active 但文件在归档目录`,
          severity: 'medium',
          suggestedAction: 'update',
        });
      }
    }

    return issues;
  }

  private detectCorruptedFiles(): ReconciliationIssue[] {
    const issues: ReconciliationIssue[] = [];
    const paths = this.store.getPaths();

    const checkFile = (filePath: string, sessionId: string) => {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);

        if (lines.length === 0) {
          issues.push({
            id: `corrupted_empty_${sessionId}`,
            type: 'corrupted_file',
            sessionId,
            description: '会话文件为空',
            severity: 'medium',
            suggestedAction: 'repair',
          });
          return;
        }

        try {
          const firstLine = JSON.parse(lines[0]);
          if (!firstLine.session && !firstLine.metadata) {
            issues.push({
              id: `corrupted_no_session_${sessionId}`,
              type: 'corrupted_file',
              sessionId,
              description: '首行缺少 session/metadata',
              severity: 'high',
              suggestedAction: 'repair',
            });
          }
        } catch {
          issues.push({
            id: `corrupted_invalid_json_${sessionId}`,
            type: 'corrupted_file',
            sessionId,
            description: '首行不是有效 JSON',
            severity: 'high',
            suggestedAction: 'repair',
          });
        }
      } catch {
        issues.push({
          id: `corrupted_read_${sessionId}`,
          type: 'corrupted_file',
          sessionId,
          description: '无法读取会话文件',
          severity: 'critical',
          suggestedAction: 'repair',
        });
      }
    };

    const activeFiles = listSessionFiles(paths.baseDir);
    for (const sessionId of activeFiles) {
      checkFile(path.join(paths.baseDir, `${sessionId}.jsonl`), sessionId);
    }

    const archivedFiles = listArchivedSessionFiles(paths.archivedDir);
    for (const sessionId of archivedFiles) {
      checkFile(path.join(paths.archivedDir, `${sessionId}.jsonl`), sessionId);
    }

    return issues;
  }

  private detectDuplicateEntries(): ReconciliationIssue[] {
    const issues: ReconciliationIssue[] = [];
    const paths = this.store.getPaths();
    const registry = loadRegistry(paths.registryFile);

    const seenIds = new Map<string, number>();
    for (const entry of registry.entries) {
      seenIds.set(entry.sessionId, (seenIds.get(entry.sessionId) || 0) + 1);
    }

    for (const [sessionId, count] of seenIds) {
      if (count > 1) {
        issues.push({
          id: `duplicate_${sessionId}`,
          type: 'duplicate_entry',
          sessionId,
          description: `注册表中有 ${count} 个重复条目`,
          severity: 'medium',
          suggestedAction: 'delete',
        });
      }
    }

    return issues;
  }

  private fixIssue(issue: ReconciliationIssue, dryRun: boolean): boolean {
    logger.info(`[ReconciliationEngine] 修复问题: ${issue.type} - ${issue.sessionId}`);

    if (dryRun) {
      return true;
    }

    switch (issue.type) {
      case 'missing_file':
        return this.createMissingFile(issue.sessionId);
      case 'missing_metadata':
        return this.updateMissingMetadata(issue.sessionId);
      case 'inconsistent_status':
        return this.fixStatusMismatch(issue.sessionId);
      case 'corrupted_file':
        return this.repairCorruptedFile(issue.sessionId);
      case 'duplicate_entry':
        return this.removeDuplicateEntries(issue.sessionId);
      default:
        return false;
    }
  }

  private createMissingFile(sessionId: string): boolean {
    try {
      const metadata = this.store.getMetadata(sessionId);
      if (metadata) {
        const { id: _, ...rest } = metadata;
        this.store.createSession({ id: sessionId, ...rest });
        return true;
      }
    } catch (err) {
      logger.error('[ReconciliationEngine] 创建缺失文件失败:', sessionId, err);
    }
    return false;
  }

  private updateMissingMetadata(sessionId: string): boolean {
    try {
      const now = new Date().toISOString();
      const result = this.store.updateMetadata(sessionId, {
        title: '未命名会话',
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      });
      return !!result;
    } catch (err) {
      logger.error('[ReconciliationEngine] 更新缺失元数据失败:', sessionId, err);
      return false;
    }
  }

  private fixStatusMismatch(sessionId: string): boolean {
    try {
      const paths = this.store.getPaths();
      const activePath = path.join(paths.baseDir, `${sessionId}.jsonl`);
      const archivedPath = path.join(paths.archivedDir, `${sessionId}.jsonl`);

      const isActive = fs.existsSync(activePath);
      const isArchived = fs.existsSync(archivedPath);

      if (isActive && !isArchived) {
        return !!this.store.updateMetadata(sessionId, { status: 'active' });
      } else if (isArchived && !isActive) {
        return !!this.store.updateMetadata(sessionId, { status: 'archived' });
      }
    } catch (err) {
      logger.error('[ReconciliationEngine] 修复状态不匹配失败:', sessionId, err);
    }
    return false;
  }

  private repairCorruptedFile(sessionId: string): boolean {
    try {
      const recovery = this.store.getMaintenance();
      const health = recovery.quickCheck();
      if (!health.healthy) {
        recovery.runMaintenance({ verifyIntegrity: true });
        return true;
      }
    } catch (err) {
      logger.error('[ReconciliationEngine] 修复损坏文件失败:', sessionId, err);
    }
    return false;
  }

  private removeDuplicateEntries(sessionId: string): boolean {
    try {
      const maintenance = this.store.getMaintenance();
      maintenance.removeRegistryEntry(sessionId);
      return true;
    } catch (err) {
      logger.error('[ReconciliationEngine] 删除重复条目失败:', sessionId, err);
    }
    return false;
  }

  private getTotalSessionCount(): number {
    const active = this.store.listSessions({ status: 'active' }).total;
    const archived = this.store.listSessions({ status: 'archived' }).total;
    return active + archived;
  }

  private countIssueTypes(issues: ReconciliationIssue[], stats: Partial<ReconciliationStats>): void {
    for (const issue of issues) {
      switch (issue.type) {
        case 'missing_file':
          stats.missingFiles = (stats.missingFiles || 0) + 1;
          break;
        case 'missing_metadata':
          stats.missingMetadata = (stats.missingMetadata || 0) + 1;
          break;
        case 'corrupted_file':
          stats.corruptedFiles = (stats.corruptedFiles || 0) + 1;
          break;
        case 'duplicate_entry':
          stats.duplicateEntries = (stats.duplicateEntries || 0) + 1;
          break;
        case 'inconsistent_status':
          stats.statusMismatches = (stats.statusMismatches || 0) + 1;
          break;
      }
    }
  }
}