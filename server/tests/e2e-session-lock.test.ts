/**
 * 端到端测试：跨进程文件锁 + 会话读写流程
 *
 * 测试场景：
 * 1. 基本加锁/释放
 * 2. 互斥性（同会话不能同时获取锁）
 * 3. 锁重入（释放后可再次获取）
 * 4. 过期锁清理
 * 5. appendSessionLine + readSessionLines 往返一致性
 * 6. rewriteSessionFirstLine 保留后续行
 * 7. stat 快照缓存命中率
 * 8. 分页读取
 * 9. PID 回收检测（模拟）
 * 10. 并发写入（子进程模拟跨进程）
 */

import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

// CommonJS 环境下 __dirname 全局可用，无需 import.meta.url

// 测试结果
const results: { name: string; pass: boolean; detail?: string }[] = [];

function assert(name: string, condition: boolean, detail?: string) {
  results.push({ name, pass: condition, detail });
  const status = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} ${name}${detail ? ' — ' + detail : ''}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function test1_basicLock(): Promise<void> {
  const { acquireSessionWriteLockSync } = await import('../storage/sessionWriteLock.js');
  const sessionId = `test-e2e-${Date.now()}-1`;

  const release = acquireSessionWriteLockSync(sessionId);
  assert('1a 基本加锁', true);

  release();
  assert('1b 基本释放', true);

  // 清理锁文件
  const lockPath = path.join(process.env.HOME!, '.cdf-know-clow/sessions', `${sessionId}.jsonl.lock`);
  assert('1c 锁文件已删除', !fs.existsSync(lockPath));
}

async function test2_mutex(): Promise<void> {
  const { acquireSessionWriteLockSync, isSessionLocked } = await import('../storage/sessionWriteLock.js');
  const sessionId = `test-e2e-${Date.now()}-2`;

  const release = acquireSessionWriteLockSync(sessionId);
  assert('2a 获取锁', true);

  assert('2b isSessionLocked=true', isSessionLocked(sessionId));

  // 尝试再次获取应该阻塞（但我们用短超时）
  try {
    acquireSessionWriteLockSync(sessionId, { timeoutMs: 500 });
    assert('2c 互斥性', false, '应该超时但成功获取了锁');
  } catch {
    assert('2c 互斥性', true, '第二次获取超时如预期');
  }

  release();
  assert('2d 释放后isSessionLocked=false', !isSessionLocked(sessionId));
}

async function test3_reentrant(): Promise<void> {
  const { acquireSessionWriteLockSync } = await import('../storage/sessionWriteLock.js');
  const sessionId = `test-e2e-${Date.now()}-3`;

  const r1 = acquireSessionWriteLockSync(sessionId);
  r1();

  const r2 = acquireSessionWriteLockSync(sessionId);
  assert('3 释放后可再次获取', true);
  r2();
}

async function test4_appendAndRead(): Promise<void> {
  const { FileStorage } = await import('../storage/FileStorage.js');
  const sessionId = `test-e2e-${Date.now()}-4`;

  // 写入 session header
  FileStorage.appendSessionLine(sessionId, { session: { id: sessionId, title: 'Test' }, messages: [] });

  // 追加 5 条消息
  for (let i = 0; i < 5; i++) {
    FileStorage.appendSessionLine(sessionId, { message: { role: 'user', content: `msg-${i}` } });
  }

  // 读取全部
  const lines = FileStorage.readSessionLines(sessionId);
  assert('4a 行数正确', lines.length === 6, `expected 6, got ${lines.length}`);

  const firstLine = lines[0] as any;
  assert('4b 首行是 session header', firstLine.session?.id === sessionId);

  // 清理
  FileStorage.deleteSessionFile(sessionId);
}

async function test5_rewriteFirstLine(): Promise<void> {
  const { FileStorage } = await import('../storage/FileStorage.js');
  const sessionId = `test-e2e-${Date.now()}-5`;

  // 写入 header + 3 条消息
  FileStorage.appendSessionLine(sessionId, { session: { id: sessionId, title: 'Old' }, messages: [] });
  for (let i = 0; i < 3; i++) {
    FileStorage.appendSessionLine(sessionId, { message: { role: 'user', content: `msg-${i}` } });
  }

  // 重写首行
  FileStorage.rewriteSessionFirstLine(sessionId, { session: { id: sessionId, title: 'New' }, messages: [] });

  // 验证后续行不变
  const lines = FileStorage.readSessionLines(sessionId);
  assert('5a 行数不变', lines.length === 4, `expected 4, got ${lines.length}`);

  const firstLine = lines[0] as any;
  assert('5b 首行已更新', firstLine.session?.title === 'New', `got ${firstLine.session?.title}`);

  const secondLine = lines[1] as any;
  assert('5c 后续行保留', secondLine.message?.content === 'msg-0');

  // 清理
  FileStorage.deleteSessionFile(sessionId);
}

async function test6_cacheHit(): Promise<void> {
  const { FileStorage } = await import('../storage/FileStorage.js');
  const sessionId = `test-e2e-${Date.now()}-6`;

  FileStorage.appendSessionLine(sessionId, { session: { id: sessionId }, messages: [] });
  for (let i = 0; i < 10; i++) {
    FileStorage.appendSessionLine(sessionId, { message: { role: 'user', content: `msg-${i}` } });
  }

  // 第一次读：未命中缓存
  const t0 = Date.now();
  const lines1 = FileStorage.readSessionLines(sessionId);
  const t1 = Date.now();

  // 第二次读：应命中缓存
  const lines2 = FileStorage.readSessionLines(sessionId);
  const t2 = Date.now();

  assert('6a 缓存返回相同结果', lines1.length === lines2.length);
  assert('6b 第二次更快', (t2 - t1) <= (t1 - t0), `first=${t1 - t0}ms, second=${t2 - t1}ms`);

  // 追加后增量合并
  FileStorage.appendSessionLine(sessionId, { message: { role: 'user', content: 'new' } });
  const lines3 = FileStorage.readSessionLines(sessionId);
  assert('6c 增量合并正确', lines3.length === lines1.length + 1, `expected ${lines1.length + 1}, got ${lines3.length}`);

  // 清理
  FileStorage.deleteSessionFile(sessionId);
}

async function test7_pagedRead(): Promise<void> {
  const { FileStorage } = await import('../storage/FileStorage.js');
  const sessionId = `test-e2e-${Date.now()}-7`;

  FileStorage.appendSessionLine(sessionId, { session: { id: sessionId }, messages: [] });
  for (let i = 0; i < 20; i++) {
    FileStorage.appendSessionLine(sessionId, { message: { role: 'user', content: `msg-${i}` } });
  }

  // 分页读取最近 5 条
  const page1 = FileStorage.readSessionMessagesPaged(sessionId, 5);
  assert('7a 分页返回 5 条', page1.messages.length === 5, `got ${page1.messages.length}`);
  assert('7b hasMore=true', page1.hasMore === true);
  assert('7c totalCount=20', page1.totalCount === 20, `got ${page1.totalCount}`);

  // 清理
  FileStorage.deleteSessionFile(sessionId);
}

async function test8_staleLockCleanup(): Promise<void> {
  const { acquireSessionWriteLockSync, inspectSessionLock } = await import('../storage/sessionWriteLock.js');
  const sessionId = `test-e2e-${Date.now()}-8`;

  // 手动创建一个伪造的过期锁（pid=999999 不存在）
  const lockPath = path.join(process.env.HOME!, '.cdf-know-clow/sessions', `${sessionId}.jsonl.lock`);
  const fakePayload = JSON.stringify({
    pid: 999999,
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 小时前
    starttime: 'fake',
    maxHoldMs: 5000,
  });
  fs.writeFileSync(lockPath, fakePayload, 'utf-8');

  // 检查锁状态
  const inspection = inspectSessionLock(sessionId);
  assert('8a 检测到过期锁', inspection?.stale === true, `reasons: ${inspection?.staleReasons.join(',')}`);

  // 应该能获取到锁（自动清理过期锁）
  const release = acquireSessionWriteLockSync(sessionId, { timeoutMs: 3000 });
  assert('8b 清理过期锁后获取成功', true);
  release();

  // 清理
  try { fs.unlinkSync(lockPath); } catch {}
}

async function test9_concurrentAppend(): Promise<void> {
  const { FileStorage } = await import('../storage/FileStorage.js');
  const sessionId = `test-e2e-${Date.now()}-9`;

  FileStorage.appendSessionLine(sessionId, { session: { id: sessionId }, messages: [] });

  // 在同一进程内并发追加 10 条
  const promises: Promise<void>[] = [];
  for (let i = 0; i < 10; i++) {
    promises.push(
      new Promise((resolve) => {
        setImmediate(() => {
          FileStorage.appendSessionLine(sessionId, { message: { role: 'user', content: `concurrent-${i}` } });
          resolve();
        });
      }),
    );
  }
  await Promise.all(promises);

  const lines = FileStorage.readSessionLines(sessionId);
  assert('9 并发追加后行数正确', lines.length === 11, `expected 11, got ${lines.length}`);

  // 清理
  FileStorage.deleteSessionFile(sessionId);
}

async function test10_crossProcess(): Promise<void> {
  // 用子进程模拟跨进程并发
  const sessionId = `test-e2e-${Date.now()}-10`;
  const { FileStorage } = await import('../storage/FileStorage.js');

  FileStorage.appendSessionLine(sessionId, { session: { id: sessionId }, messages: [] });

  // 子进程脚本（写临时文件）
  const childScriptPath = path.join(process.cwd(), 'server/tests/_tmp-child.ts');
  const childScript = `
import { FileStorage } from '../storage/FileStorage.js';
FileStorage.appendSessionLine('${sessionId}', { message: { role: 'user', content: 'from-child' } });
console.log('child done');
`;
  fs.writeFileSync(childScriptPath, childScript, 'utf-8');

  try {
    const child = spawn('npx', ['tsx', childScriptPath], {
      cwd: process.cwd(),
      stdio: 'pipe',
      shell: true,
    });

    let childOutput = '';
    child.stdout?.on('data', (data) => { childOutput += data.toString(); });
    child.stderr?.on('data', (data) => { childOutput += data.toString(); });

    await new Promise<void>((resolve) => {
      child.on('close', () => resolve());
      setTimeout(() => {
        child.kill();
        resolve();
      }, 10000);
    });

    const lines = FileStorage.readSessionLines(sessionId);
    assert('10 跨进程追加成功', lines.length >= 2, `expected >=2, got ${lines.length}, child output: ${childOutput.slice(0, 200)}`);

    // 清理
    FileStorage.deleteSessionFile(sessionId);
  } finally {
    try { fs.unlinkSync(childScriptPath); } catch {}
  }
}

// ===================== 运行 =====================

async function main() {
  console.log('=== 端到端测试开始 ===\n');

  await test1_basicLock();
  await test2_mutex();
  await test3_reentrant();
  await test4_appendAndRead();
  await test5_rewriteFirstLine();
  await test6_cacheHit();
  await test7_pagedRead();
  await test8_staleLockCleanup();
  await test9_concurrentAppend();
  await test10_crossProcess();

  console.log('\n=== 测试结果汇总 ===');
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`通过: ${passed}, 失败: ${failed}, 总计: ${results.length}`);

  if (failed > 0) {
    console.log('\n失败项:');
    results.filter((r) => !r.pass).forEach((r) => {
      console.log(`  - ${r.name}: ${r.detail || ''}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ 全部通过');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
