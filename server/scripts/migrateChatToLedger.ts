/**
 * EventLedgerMigrator — 历史数据迁移脚本
 *
 * 将现有的 chat.db 历史消息一次性导入事件账本。
 * 支持：
 * - 增量迁移（只迁移新增消息）
 * - 全量迁移
 * - Dry-run 模式（只打印不写入）
 * - 进度显示
 *
 * 使用方式：
 *   npx tsx server/scripts/migrateChatToLedger.ts
 *   npx tsx server/scripts/migrateChatToLedger.ts --dry-run
 *   npx tsx server/scripts/migrateChatToLedger.ts --incremental
 */

import Database from 'better-sqlite3';
import { AppPaths } from '../config/appPaths.js';
import { getEventLedger } from '../engine/eventLedger.js';
import { logger } from '../logger.js';
import fs from 'fs';
import path from 'path';

// ==================== CLI 参数解析 ====================

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isIncremental = args.includes('--incremental');
const isHelp = args.includes('--help');

if (isHelp) {
  console.log(`
EventLedger 历史数据迁移工具

用法:
  npx tsx server/scripts/migrateChatToLedger.ts [选项]

选项:
  --dry-run     模拟运行，只打印不写入
  --incremental 增量迁移（只迁移新增消息）
  --help       显示帮助信息

示例:
  # 全量迁移
  npx tsx server/scripts/migrateChatToLedger.ts

  # 增量迁移
  npx tsx server/scripts/migrateChatToLedger.ts --incremental

  # 模拟运行
  npx tsx server/scripts/migrateChatToLedger.ts --dry-run
`);
  process.exit(0);
}

// ==================== 迁移逻辑 ====================

async function migrate() {
  const chatDbPath = AppPaths.chatDbFile;
  const eventLedgerPath = path.join(AppPaths.dataDir, 'event-ledger.db');

  console.log('='.repeat(60));
  console.log('EventLedger 历史数据迁移工具');
  console.log('='.repeat(60));
  console.log(`Chat DB: ${chatDbPath}`);
  console.log(`Event Ledger: ${eventLedgerPath}`);
  console.log(`模式: ${isDryRun ? 'DRY-RUN (只打印不写入)' : isIncremental ? '增量迁移' : '全量迁移'}`);
  console.log('='.repeat(60));

  // 检查 chat.db 是否存在
  if (!fs.existsSync(chatDbPath)) {
    console.error(`❌ Chat DB 不存在: ${chatDbPath}`);
    process.exit(1);
  }

  // 打开 chat.db
  const chatDb = new Database(chatDbPath, { readonly: true });

  // 初始化 Event Ledger
  const ledger = getEventLedger();
  await ledger.init();

  // 获取统计信息
  const stats = await ledger.getStats();
  console.log(`\n当前 Event Ledger 状态:`);
  console.log(`  - 会话数: ${stats.totalSessions}`);
  console.log(`  - 事件数: ${stats.totalEvents}`);

  // 获取会话列表
  const sessions = chatDb
    .prepare('SELECT id, title, model, created_at, updated_at FROM sessions ORDER BY created_at ASC')
    .all() as Array<{
      id: string;
      title: string;
      model: string;
      created_at: string;
      updated_at: string;
    }>;

  console.log(`\nChat DB 会话数: ${sessions.length}`);

  // 获取已迁移的会话 ID
  const migratedSessions = new Set<string>();
  if (isIncremental) {
    const existingSessions = await ledger.listSessions({ limit: 10000 });
    for (const s of existingSessions) {
      migratedSessions.add(s.sessionId);
    }
    console.log(`已迁移会话数: ${migratedSessions.size}`);
  }

  const toMigrate = sessions.filter((s) => !migratedSessions.has(s.id));
  console.log(`待迁移会话数: ${toMigrate.length}`);
  console.log();

  if (toMigrate.length === 0) {
    console.log('✅ 没有需要迁移的会话');
    chatDb.close();
    return;
  }

  // 开始迁移
  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let totalEvents = 0;

  for (const session of toMigrate) {
    try {
      // 获取会话消息
      const messages = chatDb
        .prepare(
          `SELECT id, role, content, model, timestamp, tool_calls, thinking, thinking_duration
           FROM messages
           WHERE session_id = ?
           ORDER BY timestamp ASC`
        )
        .all(session.id) as Array<{
          id: string;
          role: string;
          content: string;
          model: string;
          timestamp: string;
          tool_calls?: string;
          thinking?: string;
          thinking_duration?: number;
        }>;

      if (messages.length === 0) {
        skippedCount++;
        continue;
      }

      // 迁移会话元信息
      if (!isDryRun) {
        await ledger.recordEvent(session.id, 'session.created', {
          title: session.title,
          model: session.model,
          migratedFrom: 'chat.db',
          createdAt: session.created_at,
        });
      }
      totalEvents++;

      // 迁移每条消息
      for (const msg of messages) {
        if (!isDryRun) {
          await ledger.recordEvent(session.id, 'message.created', {
            messageId: msg.id,
            role: msg.role,
            content: msg.content,
            model: msg.model,
            toolCalls: msg.tool_calls ? JSON.parse(msg.tool_calls) : undefined,
            thinking: msg.thinking,
            thinkingDuration: msg.thinking_duration,
            migratedFrom: 'chat.db',
            timestamp: msg.timestamp,
          });
        }
        totalEvents++;
      }

      migratedCount++;

      // 进度显示
      const progress = Math.round((migratedCount / toMigrate.length) * 100);
      const bar = '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
      process.stdout.write(`\r  [${bar}] ${progress}% (${migratedCount}/${toMigrate.length}) - ${session.id.slice(0, 8)}...`);

    } catch (err) {
      errorCount++;
      console.error(`\n❌ 迁移会话失败: ${session.id}`);
      console.error(`   错误: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log();
  console.log();
  console.log('='.repeat(60));
  console.log('迁移完成');
  console.log('='.repeat(60));
  console.log(`  ✅ 成功: ${migratedCount} 个会话`);
  if (skippedCount > 0) console.log(`  ⏭️  跳过: ${skippedCount} 个会话（无消息）`);
  if (errorCount > 0) console.log(`  ❌ 失败: ${errorCount} 个会话`);
  console.log(`  📝 总事件: ${totalEvents}`);

  // 最终统计
  const finalStats = await ledger.getStats();
  console.log();
  console.log('Event Ledger 最终状态:');
  console.log(`  - 会话数: ${finalStats.totalSessions}`);
  console.log(`  - 事件数: ${finalStats.totalEvents}`);
  console.log(`  - DB 大小: ${(finalStats.dbSizeBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log();

  chatDb.close();
}

// 执行迁移
migrate()
  .then(() => {
    console.log('✅ 迁移任务完成');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ 迁移失败:', err);
    process.exit(1);
  });
