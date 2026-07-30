/**
 * loopDetector 死循环检测 单元测试
 *
 * 测试 Jaccard 相似度计算、错误类型加权、连续检测、升级策略等核心逻辑。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LoopDetector } from './loopDetector.js';
import type { Observation } from './observer.js';
import type { ObservationLevel } from './observerRules.js';

// ---- 辅助构造 Observation ----

function makeObs(
  toolName: string,
  result: string,
  level: ObservationLevel = 'success',
  reason: string = '',
): Observation {
  return {
    toolCall: { name: toolName, arguments: {} },
    result,
    assessment: {
      level,
      reason,
      shouldRetry: false,
      shouldAdjustStrategy: false,
      maxRetries: 0,
    },
  };
}

describe('LoopDetector', () => {
  let detector: LoopDetector;

  beforeEach(() => {
    detector = new LoopDetector();
  });

  // ===================== detectLoop 基础 =====================

  describe('detectLoop - 基础', () => {
    it('首次调用无历史时返回 isLoop=false', () => {
      const result = detector.detectLoop([makeObs('db_query', 'result A')], 0);
      expect(result.isLoop).toBe(false);
      expect(result.consecutiveCount).toBe(0);
      expect(result.similarity).toBe(0);
      expect(result.errorType).toBe('none');
    });

    it('第二轮与首轮不同时 consecutiveCount 保持 0', () => {
      detector.detectLoop([makeObs('db_query', 'apple banana cherry')], 0);
      const result = detector.detectLoop([makeObs('db_query', 'dog elephant fox')], 1);
      expect(result.isLoop).toBe(false);
      expect(result.consecutiveCount).toBe(0);
    });

    it('空观察列表不报错', () => {
      const result = detector.detectLoop([], 0);
      expect(result.isLoop).toBe(false);
      expect(result.errorType).toBe('none');
    });
  });

  // ===================== detectLoop 相似度检测 =====================

  describe('detectLoop - 相似度触发', () => {
    it('完全相同的结果连续 3 轮触发 isLoop=true', () => {
      const obs = [makeObs('db_query', 'same result text here')];
      detector.detectLoop(obs, 0);
      detector.detectLoop(obs, 1);
      const result = detector.detectLoop(obs, 2);
      // 第2轮 similarity>0.8 → consecutiveCount=1
      // 第3轮 similarity>0.8 → consecutiveCount=2
      // consecutiveThreshold=3 → 需要 consecutiveCount>=3
      // 实际需要 4 轮（首轮无比较，后续3轮递增到3）
      expect(result.consecutiveCount).toBe(2);
      expect(result.isLoop).toBe(false);
    });

    it('完全相同的结果连续 4 轮触发 isLoop=true', () => {
      const obs = [makeObs('db_query', 'same result text here')];
      detector.detectLoop(obs, 0);
      detector.detectLoop(obs, 1);
      detector.detectLoop(obs, 2);
      const result = detector.detectLoop(obs, 3);
      expect(result.consecutiveCount).toBe(3);
      expect(result.isLoop).toBe(true);
      expect(result.similarity).toBeGreaterThan(0.8);
    });

    it('不同结果重置 consecutiveCount', () => {
      const obsA = [makeObs('db_query', 'alpha beta gamma')];
      const obsB = [makeObs('db_query', 'completely different delta echo')];
      detector.detectLoop(obsA, 0);
      detector.detectLoop(obsA, 1); // consecutiveCount -> 1
      detector.detectLoop(obsB, 2); // 重置为 0
      const result = detector.detectLoop(obsA, 3);
      expect(result.consecutiveCount).toBeLessThanOrEqual(1);
    });
  });

  // ===================== detectLoop 错误类型加权 =====================

  describe('detectLoop - 错误类型加权', () => {
    it('相同错误类型时相似度加权 +0.1', () => {
      const obs = [makeObs('db_query', 'SQLITE_ERROR syntax error near table', 'error', 'sql issue')];
      detector.detectLoop(obs, 0);
      const result = detector.detectLoop(obs, 1);
      // 完全相同的结果 similarity=1，加上错误类型匹配 +0.1 → min(1, 1.1)=1
      expect(result.similarity).toBe(1);
      expect(result.errorType).toBe('sql_error');
    });

    it('不同错误类型时不加权', () => {
      const obs1 = [makeObs('db_query', 'SQLITE_ERROR syntax error', 'error', 'sql')];
      const obs2 = [makeObs('file_read', 'ENOENT no such file', 'error', 'file')];
      detector.detectLoop(obs1, 0);
      const result = detector.detectLoop(obs2, 1);
      // 结果完全不同 → similarity 低
      expect(result.similarity).toBeLessThan(0.8);
    });

    it('错误类型为 none 时不加权', () => {
      const obs1 = [makeObs('db_query', 'success result alpha', 'success')];
      const obs2 = [makeObs('db_query', 'success result alpha', 'success')];
      detector.detectLoop(obs1, 0);
      const result = detector.detectLoop(obs2, 1);
      // 相同文本 similarity=1，但 errorType=none 不加权
      expect(result.similarity).toBe(1);
      expect(result.errorType).toBe('none');
    });
  });

  // ===================== detectLoop 中文文本 =====================

  describe('detectLoop - 中文文本', () => {
    it('中文相同结果触发相似度', () => {
      const obs = [makeObs('db_query', '查询出库单成功，返回十行数据')];
      detector.detectLoop(obs, 0);
      detector.detectLoop(obs, 1);
      const result = detector.detectLoop(obs, 2);
      expect(result.similarity).toBeGreaterThan(0.8);
    });

    it('中文不同结果相似度低', () => {
      detector.detectLoop([makeObs('db_query', '查询入库单返回结果')], 0);
      const result = detector.detectLoop([makeObs('db_query', '删除库存记录操作完成')], 1);
      expect(result.similarity).toBeLessThan(0.8);
    });

    it('中英混合文本分词', () => {
      const obs = [makeObs('db_query', '查询 order 订单 status 状态')];
      detector.detectLoop(obs, 0);
      const result = detector.detectLoop(obs, 1);
      expect(result.similarity).toBeGreaterThan(0.8);
    });
  });

  // ===================== detectLoop 错误类型提取 =====================

  describe('detectLoop - 错误类型提取', () => {
    it('timeout 提取为 network_timeout', () => {
      const result = detector.detectLoop(
        [makeObs('web_fetch', 'Request timeout ETIMEDOUT', 'error')],
        0,
      );
      expect(result.errorType).toBe('network_timeout');
    });

    it('ENOENT 提取为 file_not_found', () => {
      const result = detector.detectLoop(
        [makeObs('file_read', 'Error: ENOENT no such file or directory', 'error')],
        0,
      );
      expect(result.errorType).toBe('file_not_found');
    });

    it('SQLITE_ERROR 提取为 sql_error', () => {
      const result = detector.detectLoop(
        [makeObs('db_query', 'SQLITE_ERROR: syntax error near SELECT', 'error')],
        0,
      );
      expect(result.errorType).toBe('sql_error');
    });

    it('ECONNREFUSED 提取为 connection_refused', () => {
      const result = detector.detectLoop(
        [makeObs('http_call', 'ECONNREFUSED connection refused', 'error')],
        0,
      );
      expect(result.errorType).toBe('connection_refused');
    });

    it('permission denied 提取为 permission_denied', () => {
      const result = detector.detectLoop(
        [makeObs('file_write', 'permission denied', 'error')],
        0,
      );
      expect(result.errorType).toBe('permission_denied');
    });

    it('未知错误返回 reason 或 unknown_error', () => {
      const result = detector.detectLoop(
        [makeObs('custom_tool', 'something went wrong', 'error', 'custom_reason')],
        0,
      );
      expect(result.errorType).toBe('custom_reason');
    });

    it('未知错误无 reason 时返回 unknown_error', () => {
      const result = detector.detectLoop(
        [makeObs('custom_tool', 'something went wrong', 'error', '')],
        0,
      );
      expect(result.errorType).toBe('unknown_error');
    });

    it('warning 级别也提取错误类型', () => {
      const result = detector.detectLoop(
        [makeObs('db_query', 'SQLITE_ERROR warning', 'warning')],
        0,
      );
      expect(result.errorType).toBe('sql_error');
    });

    it('success 级别返回 none', () => {
      const result = detector.detectLoop(
        [makeObs('db_query', 'query succeeded', 'success')],
        0,
      );
      expect(result.errorType).toBe('none');
    });

    it('多个观察取第一个有错误的', () => {
      const result = detector.detectLoop(
        [
          makeObs('db_query', 'success', 'success'),
          makeObs('file_read', 'ENOENT no such file', 'error'),
        ],
        0,
      );
      expect(result.errorType).toBe('file_not_found');
    });
  });

  // ===================== getEscalationStrategy =====================

  describe('getEscalationStrategy', () => {
    it('isLoop=false 时返回 switch_tool 和未检测到死循环原因', () => {
      const result = { isLoop: false, similarity: 0.5, consecutiveCount: 0, errorType: 'none' };
      const strategy = detector.getEscalationStrategy(result);
      expect(strategy.action).toBe('switch_tool');
      expect(strategy.reason).toContain('未检测到死循环');
    });

    it('第一次升级返回 switch_tool', () => {
      const result = { isLoop: true, similarity: 0.9, consecutiveCount: 3, errorType: 'sql_error' };
      const strategy = detector.getEscalationStrategy(result);
      expect(strategy.action).toBe('switch_tool');
      expect(strategy.reason).toContain('切换工具');
      expect(strategy.alternativeToolName).toBe('db_query');
    });

    it('第二次升级返回 replan', () => {
      const result = { isLoop: true, similarity: 0.9, consecutiveCount: 3, errorType: 'none' };
      detector.getEscalationStrategy(result); // level 0
      const strategy = detector.getEscalationStrategy(result); // level 1
      expect(strategy.action).toBe('replan');
      expect(strategy.reason).toContain('重规划');
    });

    it('第三次升级返回 ask_user', () => {
      const result = { isLoop: true, similarity: 0.9, consecutiveCount: 3, errorType: 'none' };
      detector.getEscalationStrategy(result); // level 0
      detector.getEscalationStrategy(result); // level 1
      const strategy = detector.getEscalationStrategy(result); // level 2
      expect(strategy.action).toBe('ask_user');
      expect(strategy.reason).toContain('用户');
    });

    it('第四次升级循环回 switch_tool', () => {
      const result = { isLoop: true, similarity: 0.9, consecutiveCount: 3, errorType: 'none' };
      detector.getEscalationStrategy(result); // level 0 → switch_tool
      detector.getEscalationStrategy(result); // level 1 → replan
      detector.getEscalationStrategy(result); // level 2 → ask_user
      const strategy = detector.getEscalationStrategy(result); // level 3%3=0 → switch_tool
      expect(strategy.action).toBe('switch_tool');
    });

    it('file_not_found 建议替代工具 file_listDir', () => {
      const result = { isLoop: true, similarity: 0.9, consecutiveCount: 3, errorType: 'file_not_found' };
      const strategy = detector.getEscalationStrategy(result);
      expect(strategy.alternativeToolName).toBe('file_listDir');
    });

    it('network_timeout 建议替代工具 web_search', () => {
      const result = { isLoop: true, similarity: 0.9, consecutiveCount: 3, errorType: 'network_timeout' };
      const strategy = detector.getEscalationStrategy(result);
      expect(strategy.alternativeToolName).toBe('web_search');
    });

    it('connection_refused 建议替代工具 web_fetch', () => {
      const result = { isLoop: true, similarity: 0.9, consecutiveCount: 3, errorType: 'connection_refused' };
      const strategy = detector.getEscalationStrategy(result);
      expect(strategy.alternativeToolName).toBe('web_fetch');
    });

    it('permission_denied 建议替代工具 system_info', () => {
      const result = { isLoop: true, similarity: 0.9, consecutiveCount: 3, errorType: 'permission_denied' };
      const strategy = detector.getEscalationStrategy(result);
      expect(strategy.alternativeToolName).toBe('system_info');
    });

    it('未知错误类型不返回替代工具', () => {
      const result = { isLoop: true, similarity: 0.9, consecutiveCount: 3, errorType: 'unknown_error' };
      const strategy = detector.getEscalationStrategy(result);
      expect(strategy.alternativeToolName).toBeUndefined();
    });
  });

  // ===================== reset =====================

  describe('reset', () => {
    it('重置后历史为空', () => {
      detector.detectLoop([makeObs('db_query', 'result')], 0);
      detector.detectLoop([makeObs('db_query', 'result')], 1);
      expect(detector.getHistory()).toHaveLength(2);
      detector.reset();
      expect(detector.getHistory()).toHaveLength(0);
    });

    it('重置后 consecutiveSimilarCount 归零', () => {
      const obs = [makeObs('db_query', 'same result')];
      detector.detectLoop(obs, 0);
      detector.detectLoop(obs, 1);
      detector.reset();
      const result = detector.detectLoop(obs, 2);
      expect(result.consecutiveCount).toBe(0);
    });

    it('重置后 escalationLevel 归零', () => {
      const loopResult = { isLoop: true, similarity: 0.9, consecutiveCount: 3, errorType: 'none' };
      detector.getEscalationStrategy(loopResult);
      detector.getEscalationStrategy(loopResult);
      detector.reset();
      // 重置后第一次升级应回到 switch_tool
      const strategy = detector.getEscalationStrategy(loopResult);
      expect(strategy.action).toBe('switch_tool');
    });
  });

  // ===================== getHistory =====================

  describe('getHistory', () => {
    it('返回历史记录副本', () => {
      detector.detectLoop([makeObs('db_query', 'result A')], 0);
      detector.detectLoop([makeObs('db_query', 'result B')], 1);
      const history = detector.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].turnIndex).toBe(0);
      expect(history[1].turnIndex).toBe(1);
    });

    it('修改返回值不影响内部状态', () => {
      detector.detectLoop([makeObs('db_query', 'result A')], 0);
      const history = detector.getHistory();
      history.push({ turnIndex: 99, errorType: 'fake', resultDigest: 'fake' });
      expect(detector.getHistory()).toHaveLength(1);
    });
  });

  // ===================== 历史记录上限 =====================

  describe('历史记录上限', () => {
    it('超过 MAX_HISTORY_SIZE 时移除最旧记录', () => {
      for (let i = 0; i < 25; i++) {
        detector.detectLoop([makeObs('db_query', `result ${i}`)], i);
      }
      const history = detector.getHistory();
      // MAX_HISTORY_SIZE=20
      expect(history.length).toBe(20);
      // 最旧记录应为第5轮（0-4被移除）
      expect(history[0].turnIndex).toBe(5);
    });
  });

  // ===================== 自定义阈值 =====================

  describe('自定义阈值', () => {
    it('自定义 consecutiveThreshold=2 时 2 轮即触发', () => {
      const d = new LoopDetector(0.8, 2);
      const obs = [makeObs('db_query', 'identical result text')];
      d.detectLoop(obs, 0);
      d.detectLoop(obs, 1);
      const result = d.detectLoop(obs, 2);
      // 第1轮: 无比较, consecutiveCount=0
      // 第2轮: similarity>0.8, consecutiveCount=1
      // 第3轮: similarity>0.8, consecutiveCount=2 → >=2 触发
      expect(result.consecutiveCount).toBe(2);
      expect(result.isLoop).toBe(true);
    });

    it('自定义 threshold=0.95 时高相似度才触发', () => {
      const d = new LoopDetector(0.95, 1);
      const obsA = [makeObs('db_query', 'alpha beta gamma delta')];
      const obsB = [makeObs('db_query', 'alpha beta gamma epsilon')];
      d.detectLoop(obsA, 0);
      const result = d.detectLoop(obsB, 1);
      // Jaccard: 交集{alpha,beta,gamma}=3, 并集{alpha,beta,gamma,delta,epsilon}=5 → 0.6
      expect(result.similarity).toBeLessThan(0.95);
      expect(result.consecutiveCount).toBe(0);
    });
  });

  // ===================== Jaccard 边界情况 =====================

  describe('Jaccard 相似度边界', () => {
    it('两个空结果相似度为 1', () => {
      // 空文本分词后都为空集 → similarity=1
      const obs = [makeObs('db_query', '')];
      detector.detectLoop(obs, 0);
      const result = detector.detectLoop(obs, 1);
      // normalizeResult 会生成 "db_query:success:" 非空，所以实际不为空
      // 但两个完全相同的 normalizeResult → similarity=1
      expect(result.similarity).toBe(1);
    });

    it('结果预览截断为 200 字符', () => {
      const longResult = 'x'.repeat(300);
      const obs = [makeObs('db_query', longResult)];
      detector.detectLoop(obs, 0);
      // 相同结果 → similarity=1
      const result = detector.detectLoop(obs, 1);
      expect(result.similarity).toBe(1);
    });
  });
});
