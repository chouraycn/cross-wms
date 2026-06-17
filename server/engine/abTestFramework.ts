/**
 * ABTestFramework — A/B 测试框架
 *
 * 支持对比不同 prompt/参数组合的效果，自动收集 metrics。
 * 使用 SQLite 持久化实验数据，提供统计分析接口。
 *
 * v6.0: P2-3 A/B 测试框架
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// ===================== 类型定义 =====================

/** 实验变体 */
export interface ExperimentVariant {
  /** 变体名 (A/B/C...) */
  name: string;
  /** 变体描述 */
  description: string;
  /** 变体参数覆盖 */
  params: Record<string, unknown>;
  /** 权重 (0-1，默认均分) */
  weight?: number;
}

/** 实验定义 */
export interface Experiment {
  /** 实验唯一 ID */
  id: string;
  /** 实验名 */
  name: string;
  /** 变体列表 */
  variants: ExperimentVariant[];
  /** 是否启用 */
  enabled: boolean;
  /** 创建时间 */
  createdAt: number;
}

/** 实验结果记录 */
export interface ExperimentResult {
  /** 实验 ID */
  experimentId: string;
  /** 变体名 */
  variantName: string;
  /** 会话 ID */
  sessionId: string;
  /** 度量指标 */
  metrics: {
    /** 总轮次 */
    totalTurns: number;
    /** 工具调用次数 */
    toolCallCount: number;
    /** 工具成功率 */
    toolSuccessRate: number;
    /** 最终置信度 */
    finalConfidence: number;
    /** 执行耗时 (ms) */
    executionTimeMs: number;
    /** 是否提前终止 */
    earlyTermination: boolean;
    /** 复杂度等级 */
    complexityLevel: string;
  };
  /** 时间戳 */
  timestamp: number;
}

/** 变体统计摘要 */
export interface VariantStats {
  /** 变体名 */
  variantName: string;
  /** 样本数 */
  sampleCount: number;
  /** 平均轮次 */
  avgTurns: number;
  /** 平均工具调用次数 */
  avgToolCalls: number;
  /** 平均成功率 */
  avgSuccessRate: number;
  /** 平均置信度 */
  avgConfidence: number;
  /** 平均耗时 (ms) */
  avgExecutionTime: number;
  /** 提前终止率 */
  earlyTerminationRate: number;
}

// ===================== ABTestFramework 类 =====================

export class ABTestFramework {
  private db: Database.Database | null = null;
  private experiments: Map<string, Experiment>;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.experiments = new Map();

    // 数据库路径：与 longTermMemory 一致的目录
    const memoryDir = dbPath || path.join(os.homedir(), '.cdf-know-clow', 'ab-test');
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
    this.dbPath = path.join(memoryDir, 'ab_test.db');
  }

  /** 初始化数据库 */
  private ensureDB(): Database.Database {
    if (!this.db) {
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS experiment_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          experiment_id TEXT NOT NULL,
          variant_name TEXT NOT NULL,
          session_id TEXT NOT NULL,
          total_turns INTEGER,
          tool_call_count INTEGER,
          tool_success_rate REAL,
          final_confidence REAL,
          execution_time_ms INTEGER,
          early_termination INTEGER DEFAULT 0,
          complexity_level TEXT,
          timestamp INTEGER NOT NULL
        )
      `);
    }
    return this.db;
  }

  /**
   * 注册实验。
   */
  registerExperiment(experiment: Experiment): void {
    this.experiments.set(experiment.id, experiment);
  }

  /**
   * 选择变体（按权重随机分配）。
   */
  selectVariant(experimentId: string, sessionId: string): ExperimentVariant | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || !experiment.enabled) return null;

    // 基于 sessionId 做确定性分配（同用户同实验始终同一变体）
    const hash = this.simpleHash(`${experimentId}:${sessionId}`);
    let totalWeight = 0;
    for (const v of experiment.variants) {
      totalWeight += v.weight ?? (1 / experiment.variants.length);
    }

    let target = (hash % 1000) / 1000 * totalWeight;
    for (const v of experiment.variants) {
      target -= v.weight ?? (1 / experiment.variants.length);
      if (target <= 0) return v;
    }

    return experiment.variants[experiment.variants.length - 1];
  }

  /**
   * 记录实验结果。
   */
  recordResult(result: ExperimentResult): void {
    const db = this.ensureDB();
    const m = result.metrics;
    db.prepare(`
      INSERT INTO experiment_results (experiment_id, variant_name, session_id, total_turns, tool_call_count, tool_success_rate, final_confidence, execution_time_ms, early_termination, complexity_level, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.experimentId,
      result.variantName,
      result.sessionId,
      m.totalTurns,
      m.toolCallCount,
      m.toolSuccessRate,
      m.finalConfidence,
      m.executionTimeMs,
      m.earlyTermination ? 1 : 0,
      m.complexityLevel,
      result.timestamp,
    );
  }

  /**
   * 获取实验统计。
   */
  getStats(experimentId: string): VariantStats[] {
    const db = this.ensureDB();
    const rows = db.prepare(`
      SELECT variant_name,
        COUNT(*) as sample_count,
        AVG(total_turns) as avg_turns,
        AVG(tool_call_count) as avg_tool_calls,
        AVG(tool_success_rate) as avg_success_rate,
        AVG(final_confidence) as avg_confidence,
        AVG(execution_time_ms) as avg_execution_time,
        SUM(early_termination) * 1.0 / COUNT(*) as early_termination_rate
      FROM experiment_results
      WHERE experiment_id = ?
      GROUP BY variant_name
    `).all(experimentId) as any[];

    return rows.map(r => ({
      variantName: r.variant_name,
      sampleCount: r.sample_count,
      avgTurns: Math.round(r.avg_turns * 100) / 100,
      avgToolCalls: Math.round(r.avg_tool_calls * 100) / 100,
      avgSuccessRate: Math.round(r.avg_success_rate * 1000) / 1000,
      avgConfidence: Math.round(r.avg_confidence * 100) / 100,
      avgExecutionTime: Math.round(r.avg_execution_time),
      earlyTerminationRate: Math.round(r.early_termination_rate * 1000) / 1000,
    }));
  }

  /** 简单哈希函数（确定性分配） */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /** 关闭数据库连接 */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /** 重置（不删除数据库，只清理内存中的实验注册） */
  reset(): void {
    this.experiments.clear();
  }
}
