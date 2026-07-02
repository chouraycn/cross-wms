/**
 * Bash/Exec 工具测试
 *
 * 测试代码执行工具的功能和安全策略
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExecToolSchema, ProcessToolSchema, ExecResultSchema } from '../bashSchemas.js';
import { executeCommand, handleProcessAction, listSessions, removeSession } from '../bashExecutor.js';
import { handleExecCommand, handleProcessControl, checkExecApprovalNeeded } from '../bashTools.js';
import { evaluateSandboxPolicy, setSandboxLevel, resetSandboxPolicyForTests } from '../sandboxPolicy.js';
import approvalManager from '../approvalManager.js';

// ===================== Schema 测试 =====================

describe('bashSchemas', () => {
  describe('ExecToolSchema', () => {
    it('应该验证有效的执行参数', () => {
      const validParams = {
        command: 'ls -la',
        workdir: '/tmp',
        timeout: 30,
      };
      const result = ExecToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('应该拒绝空命令', () => {
      const invalidParams = {
        command: '',
      };
      const result = ExecToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('不能为空');
      }
    });

    it('应该拒绝缺少命令参数', () => {
      const invalidParams = {
        workdir: '/tmp',
      };
      const result = ExecToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('应该接受可选参数', () => {
      const params = {
        command: 'echo hello',
        env: { NODE_ENV: 'test' },
        pty: true,
        background: false,
        yieldMs: 5000,
        elevated: false,
        host: 'auto',
      };
      const result = ExecToolSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('应该拒绝无效的 host 值', () => {
      const invalidParams = {
        command: 'ls',
        host: 'invalid',
      };
      const result = ExecToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('应该拒绝超大的 timeout 值', () => {
      const invalidParams = {
        command: 'ls',
        timeout: 5000, // 超过最大值 3600
      };
      const result = ExecToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  describe('ProcessToolSchema', () => {
    it('应该验证有效的 process 参数', () => {
      const validParams = {
        action: 'list',
      };
      const result = ProcessToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('应该验证 poll 参数', () => {
      const validParams = {
        action: 'poll',
        sessionId: 'exec_abc123',
        timeout: 5000,
      };
      const result = ProcessToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('应该验证 write 参数', () => {
      const validParams = {
        action: 'write',
        sessionId: 'exec_abc123',
        data: 'hello',
        eof: true,
      };
      const result = ProcessToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('应该拒绝无效的 action', () => {
      const invalidParams = {
        action: 'invalid',
      };
      const result = ProcessToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('应该拒绝超大的 poll timeout', () => {
      const invalidParams = {
        action: 'poll',
        sessionId: 'exec_abc123',
        timeout: 50000, // 超过最大值 30000
      };
      const result = ProcessToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  describe('ExecResultSchema', () => {
    it('应该验证成功的执行结果', () => {
      const validResult = {
        status: 'completed',
        stdout: 'hello',
        stderr: '',
        exitCode: 0,
        exitSignal: null,
        durationMs: 100,
        timedOut: false,
      };
      const result = ExecResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });

    it('应该验证失败的执行结果', () => {
      const validResult = {
        status: 'failed',
        stdout: '',
        stderr: 'command not found',
        exitCode: 127,
        exitSignal: null,
        durationMs: 50,
        timedOut: false,
        reason: 'Command not found',
        failureKind: 'shell-command-not-found',
      };
      const result = ExecResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });

    it('应该验证超时的执行结果', () => {
      const validResult = {
        status: 'timeout',
        stdout: 'partial output',
        stderr: '',
        exitCode: null,
        exitSignal: 'SIGKILL',
        durationMs: 30000,
        timedOut: true,
        reason: 'Command timed out',
        failureKind: 'overall-timeout',
      };
      const result = ExecResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });
  });
});

// ===================== Sandbox Policy 测试 =====================

describe('sandboxPolicy', () => {
  beforeEach(() => {
    resetSandboxPolicyForTests();
  });

  afterEach(() => {
    resetSandboxPolicyForTests();
  });

  describe('危险命令检测', () => {
    it('应该拒绝 rm -rf / 命令', () => {
      const result = evaluateSandboxPolicy({ command: 'rm -rf /' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Dangerous');
    });

    it('应该拒绝 sudo 命令', () => {
      const result = evaluateSandboxPolicy({ command: 'sudo apt update' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Dangerous');
    });

    it('应该拒绝 chmod 777 命令', () => {
      const result = evaluateSandboxPolicy({ command: 'chmod 777 /etc/passwd' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Dangerous');
    });

    it('应该拒绝 dd 写入设备命令', () => {
      const result = evaluateSandboxPolicy({ command: 'dd if=/dev/zero of=/dev/sda' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Dangerous');
    });

    it('应该拒绝 reboot 命令', () => {
      const result = evaluateSandboxPolicy({ command: 'reboot' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Dangerous');
    });

    it('应该拒绝访问敏感文件', () => {
      const result = evaluateSandboxPolicy({ command: 'cat /etc/shadow' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Dangerous');
    });
  });

  describe('安全命令检测', () => {
    it('应该允许 ls 命令', () => {
      setSandboxLevel('light');
      const result = evaluateSandboxPolicy({ command: 'ls -la' });
      expect(result.allowed).toBe(true);
    });

    it('应该允许 cat 命令（非敏感文件）', () => {
      setSandboxLevel('light');
      const result = evaluateSandboxPolicy({ command: 'cat /tmp/test.txt' });
      expect(result.allowed).toBe(true);
    });

    it('应该允许 echo 命令', () => {
      setSandboxLevel('strict');
      const result = evaluateSandboxPolicy({ command: 'echo hello' });
      expect(result.allowed).toBe(true);
    });
  });

  describe('沙箱等级', () => {
    it('none 级别应该允许所有命令', () => {
      setSandboxLevel('none');
      // 注意：危险命令仍然会被拒绝（这是安全底线）
      const result = evaluateSandboxPolicy({ command: 'npm test' });
      expect(result.allowed).toBe(true);
    });

    it('strict 级别应该只允许 echo', () => {
      setSandboxLevel('strict');
      const result = evaluateSandboxPolicy({ command: 'ls' });
      expect(result.allowed).toBe(false);
    });

    it('medium 级别应该限制命令范围', () => {
      setSandboxLevel('medium');
      const result = evaluateSandboxPolicy({ command: 'ls' });
      expect(result.allowed).toBe(true);

      const rmResult = evaluateSandboxPolicy({ command: 'rm test.txt' });
      expect(rmResult.allowed).toBe(false);
    });
  });
});

// ===================== Exec Approval 测试 =====================

describe('checkExecApprovalNeeded', () => {
  beforeEach(() => {
    resetSandboxPolicyForTests();
    approvalManager.setConfig({ mode: 'manual' });
  });

  afterEach(() => {
    resetSandboxPolicyForTests();
  });

  it('应该识别高风险命令', () => {
    const result = checkExecApprovalNeeded({ command: 'rm -rf test' });
    expect(result).not.toBeNull();
    expect(result?.riskLevel).toBe('high');
  });

  it('应该识别提权请求', () => {
    setSandboxLevel('light');
    const result = checkExecApprovalNeeded({
      command: 'ls',
      elevated: true,
    });
    expect(result).not.toBeNull();
    expect(result?.riskLevel).toBe('high');
  });

  it('应该识别中等风险命令', () => {
    setSandboxLevel('light');
    const result = checkExecApprovalNeeded({ command: 'npm publish' });
    expect(result).not.toBeNull();
    expect(result?.riskLevel).toBe('medium');
  });

  it('应该识别网络相关命令', () => {
    setSandboxLevel('light');
    const result = checkExecApprovalNeeded({ command: 'curl https://example.com' });
    expect(result).not.toBeNull();
    expect(result?.riskLevel).toBe('medium');
  });

  it('应该返回 null 表示安全命令', () => {
    setSandboxLevel('light');
    const result = checkExecApprovalNeeded({ command: 'ls -la' });
    expect(result).toBeNull();
  });
});

// ===================== Exec Executor 测试 =====================

describe('bashExecutor', () => {
  describe('executeCommand', () => {
    it('应该成功执行简单命令', async () => {
      setSandboxLevel('none');
      const result = await executeCommand({
        params: { command: 'echo hello' },
      });

      expect(result.status).toBe('completed');
      expect(result.stdout.trim()).toBe('hello');
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    }, 10000);

    it('应该处理命令错误', async () => {
      setSandboxLevel('none');
      const result = await executeCommand({
        params: { command: 'ls /nonexistent' },
      });

      expect(result.status).toBe('completed');
      expect(result.exitCode).toBeGreaterThan(0); // ls 错误码（macOS=1, Linux=2）
      expect(result.stderr.length).toBeGreaterThan(0);
    }, 10000);

    it('应该超时终止长时间运行的命令', async () => {
      setSandboxLevel('none');
      const result = await executeCommand({
        params: {
          command: 'sleep 10',
          timeout: 1, // 1秒超时
        },
      });

      expect(result.status).toBe('timeout');
      expect(result.timedOut).toBe(true);
      expect(result.exitSignal).toBe('SIGKILL');
    }, 15000);

    it('应该截断超长输出', async () => {
      setSandboxLevel('none');
      const result = await executeCommand({
        params: { command: 'echo "test output"' },
        config: {
          maxOutputChars: 5,
        },
      });

      expect(result.stdout.length).toBeLessThanOrEqual(20); // 包含截断提示
    }, 10000);

    it('应该拒绝危险命令', async () => {
      const result = await executeCommand({
        params: { command: 'rm -rf /' },
      });

      expect(result.status).toBe('failed');
      expect(result.reason).toContain('Dangerous');
    });
  });

  describe('handleProcessAction', () => {
    beforeEach(() => {
      // 清理所有会话
      const sessions = listSessions();
      for (const session of sessions) {
        removeSession(session.id);
      }
    });

    it('应该列出所有进程', async () => {
      const result = await handleProcessAction({ action: 'list' });
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('应该拒绝无效的 sessionId', async () => {
      const result = await handleProcessAction({
        action: 'poll',
        sessionId: 'invalid',
      });
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain('不存在');
    });
  });
});

// ===================== Tool Handler 测试 =====================

describe('bashTools handlers', () => {
  beforeEach(() => {
    resetSandboxPolicyForTests();
    approvalManager.setConfig({ mode: 'auto_approve_safe' });
  });

  afterEach(() => {
    resetSandboxPolicyForTests();
  });

  describe('handleExecCommand', () => {
    it('应该处理有效的执行请求', async () => {
      setSandboxLevel('none');
      const result = await handleExecCommand({
        command: 'echo test',
      });
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('completed');
      expect(parsed.stdout.trim()).toBe('test');
    }, 10000);

    it('应该拒绝无效参数', async () => {
      const result = await handleExecCommand({
        // 缺少 command
      } as Record<string, unknown>);
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });

    it('应该处理后台进程请求', async () => {
      setSandboxLevel('none');
      const result = await handleExecCommand({
        command: 'sleep 30',
        background: true,
      });
      const parsed = JSON.parse(result);

      // 后台进程应该返回 running 状态
      expect(parsed.status).toBe('running');
      expect(parsed.sessionId).toBeDefined();

      // 清理进程
      if (parsed.sessionId) {
        await handleProcessControl({
          action: 'kill',
          sessionId: parsed.sessionId,
        });
      }
    }, 15000);
  });

  describe('handleProcessControl', () => {
    it('应该处理 list 操作', async () => {
      const result = await handleProcessControl({ action: 'list' });
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('应该拒绝缺少 sessionId 的操作', async () => {
      const result = await handleProcessControl({
        action: 'poll',
        // 缺少 sessionId
      });
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain('必需');
    });
  });
});

// ===================== Integration 测试 =====================

describe('bashTools integration', () => {
  beforeEach(() => {
    resetSandboxPolicyForTests();
    approvalManager.setConfig({ mode: 'manual' });
  });

  afterEach(() => {
    resetSandboxPolicyForTests();
    // 清理所有会话
    const sessions = listSessions();
    for (const session of sessions) {
      removeSession(session.id);
    }
  });

  it('应该完成完整的执行流程', async () => {
    setSandboxLevel('none');
    approvalManager.setConfig({ mode: 'auto_approve_all' });

    // 执行命令
    const execResult = await handleExecCommand({
      command: 'echo "integration test"',
    });
    const parsedExec = JSON.parse(execResult);
    expect(parsedExec.status).toBe('completed');
    expect(parsedExec.stdout).toContain('integration test');
  }, 10000);

  it('应该处理后台进程的完整生命周期', async () => {
    setSandboxLevel('none');
    approvalManager.setConfig({ mode: 'auto_approve_all' });

    // 启动后台进程
    const execResult = await handleExecCommand({
      command: 'sleep 30',
      background: true,
    });
    const parsedExec = JSON.parse(execResult);
    expect(parsedExec.status).toBe('running');
    expect(parsedExec.sessionId).toBeDefined();

    const sessionId = parsedExec.sessionId;

    // 列出进程（应该包含我们的进程）
    const listResult = await handleProcessControl({ action: 'list' });
    const parsedList = JSON.parse(listResult);
    expect(parsedList.some((s: { id: string }) => s.id === sessionId)).toBe(true);

    // 终止进程
    const killResult = await handleProcessControl({
      action: 'kill',
      sessionId,
    });
    const parsedKill = JSON.parse(killResult);
    expect(parsedKill.success).toBe(true);

    // 移除进程记录
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待进程退出
    const removeResult = await handleProcessControl({
      action: 'remove',
      sessionId,
    });
    const parsedRemove = JSON.parse(removeResult);
    expect(parsedRemove.success).toBe(true);
  }, 20000);
});