/**
 * SSH 沙箱传输
 *
 * 提供远程 SSH 沙箱的配置生成、命令片段校验、远程命令执行与工作区目录上传能力。
 * 临时 SSH 配置文件写入独立临时目录，权限收紧为 0600，使用完毕后可通过 dispose 清理。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertPathWithinBoundary } from '../../infra/boundary-path.js';
import { toErrorObject } from '../../infra/errors.js';

/** SSH 远程主机描述 */
export type SshRemoteHost = {
  user?: string;
  host: string;
  port?: number;
};

/** SSH 配置生成选项 */
export type SshSandboxConfigOptions = {
  /** 私钥文件路径 */
  identityFile?: string;
  /** known_hosts 文件路径 */
  knownHostsFile?: string;
  /** 是否严格校验主机密钥，默认 false */
  strictHostKeyChecking?: boolean;
  /** 连接超时秒数，默认 5 */
  connectTimeout?: number;
};

/** 生成的 SSH 会话描述 */
export type SshSandboxSession = {
  /** 临时配置文件路径 */
  configPath: string;
  /** 配置中的 Host 别名 */
  hostAlias: string;
};

/** 远程命令执行结果 */
export type SshSandboxCommandResult = {
  stdout: Buffer;
  stderr: Buffer;
  /** 退出码 */
  code: number;
};

/** 远程命令执行选项 */
export type SshSandboxExecOptions = {
  /** 标准输入内容 */
  stdin?: Buffer | string;
  /** 是否允许非零退出码而不抛错 */
  allowFailure?: boolean;
  /** 中止信号 */
  signal?: AbortSignal;
  /** 是否分配伪终端 */
  tty?: boolean;
};

/** Shell 片段校验结果 */
export type ShellValidationResult = {
  valid: boolean;
  reason?: string;
};

// === 主机解析与命令构造 ===

/** 解析 user@host:port 形式的远程主机字符串 */
export function parseRemoteHost(remoteHost: string): SshRemoteHost {
  const trimmed = remoteHost.trim();
  let user: string | undefined;
  let hostPart = trimmed;
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex >= 0) {
    user = trimmed.slice(0, atIndex);
    hostPart = trimmed.slice(atIndex + 1);
  }
  let host = hostPart;
  let port: number | undefined;
  const colonIndex = hostPart.lastIndexOf(':');
  if (colonIndex >= 0) {
    const portPart = hostPart.slice(colonIndex + 1);
    const parsed = Number(portPart);
    if (portPart !== '' && Number.isInteger(parsed) && parsed > 0) {
      port = parsed;
      host = hostPart.slice(0, colonIndex);
    }
  }
  if (!host) {
    throw new Error(`无效的 SSH 远程主机: ${remoteHost}`);
  }
  return { user, host, port };
}

/** 单引号转义，用于 POSIX shell 参数构造 */
export function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/** 将 argv 构造为远程 shell 命令字符串 */
export function buildRemoteCommand(argv: string[]): string {
  return argv.map((entry) => shellEscape(entry)).join(' ');
}

// === Shell 片段校验 ===

type ShellQuoteState = 'plain' | 'single' | 'double';

type ShellFrame = {
  kind: 'root' | 'command-substitution' | 'arithmetic' | 'backtick';
  quote: ShellQuoteState;
  escaping: boolean;
  parenDepth: number;
};

type HeredocMarker = {
  delimiter: string;
  stripLeadingTabs: boolean;
};

type PendingHeredoc = HeredocMarker & {
  frameDepth: number;
};

/** 校验 shell 命令片段，返回校验结果 */
export function validateShellCommand(command: string): ShellValidationResult {
  try {
    assertValidShellCommand(command);
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 断言 shell 命令片段语法合法，不合法则抛出 */
function assertValidShellCommand(command: string): void {
  // SSH 沙箱会用 /bin/sh -c 包裹模型提供的 shell 文本，此解析器用于在引号前
  // 捕获未闭合语法与未解析的占位符。
  const frames: ShellFrame[] = [
    { kind: 'root', quote: 'plain', escaping: false, parenDepth: 0 },
  ];
  const pendingHeredocs: PendingHeredoc[] = [];

  for (let index = 0; index < command.length; index += 1) {
    const frame = frames.at(-1);
    if (!frame) {
      throw new Error('Shell 命令解析异常: 解析栈下溢');
    }
    const char = command[index];

    if (frame.escaping) {
      frame.escaping = false;
      continue;
    }

    if (frame.quote === 'single') {
      if (char === "'") {
        frame.quote = 'plain';
      }
      continue;
    }

    if (char === '\\') {
      frame.escaping = true;
      continue;
    }

    if (frame.quote === 'double') {
      if (char === '"') {
        frame.quote = 'plain';
        continue;
      }
      if (char === '`') {
        frames.push(createShellFrame('backtick'));
        continue;
      }
      if (char === '$' && command[index + 1] === '(' && command[index + 2] === '(') {
        frames.push(createShellFrame('arithmetic', 2));
        index += 2;
        continue;
      }
      if (char === '$' && command[index + 1] === '(') {
        frames.push(createShellFrame('command-substitution', 1));
        index += 1;
      }
      continue;
    }

    if (frame.kind === 'arithmetic') {
      if (char === '(') {
        frame.parenDepth += 1;
        continue;
      }
      if (char === ')') {
        frame.parenDepth -= 1;
        if (frame.parenDepth === 0) {
          frames.pop();
        }
      }
      continue;
    }

    if (char === '\n') {
      const frameHeredocs = pendingHeredocs.filter(
        (pending) => pending.frameDepth === frames.length,
      );
      if (frameHeredocs.length > 0) {
        // here-doc 内容为不透明 shell 载荷，跳过以仅校验可执行语法
        index = skipHeredocBodies(command, index + 1, frameHeredocs) - 1;
        for (const pending of frameHeredocs) {
          pendingHeredocs.splice(pendingHeredocs.indexOf(pending), 1);
        }
        continue;
      }
    }

    if (frame.kind === 'backtick' && char === '`') {
      frames.pop();
      continue;
    }
    if (char === "'") {
      frame.quote = 'single';
      continue;
    }
    if (char === '"') {
      frame.quote = 'double';
      continue;
    }
    if (char === '`') {
      frames.push(createShellFrame('backtick'));
      continue;
    }
    if (char === '$' && command[index + 1] === '(' && command[index + 2] === '(') {
      frames.push(createShellFrame('arithmetic', 2));
      index += 2;
      continue;
    }
    if (char === '$' && command[index + 1] === '(') {
      frames.push(createShellFrame('command-substitution', 1));
      index += 1;
      continue;
    }
    if (char === '#' && isShellCommentStart(command, index)) {
      index = skipShellComment(command, index) - 1;
      continue;
    }
    if (char === '<') {
      const heredoc = readHeredoc(command, index);
      if (heredoc) {
        pendingHeredocs.push({
          ...heredoc.pending,
          frameDepth: frames.length,
        });
        index = heredoc.endIndex - 1;
        continue;
      }
      const placeholder = readPlaceholderToken(command, index);
      if (placeholder) {
        throw new Error(`Shell 命令包含未解析的占位符: ${placeholder}`);
      }
    }
    if (frame.kind === 'command-substitution') {
      if (char === '(') {
        frame.parenDepth += 1;
        continue;
      }
      if (char === ')') {
        frame.parenDepth -= 1;
        if (frame.parenDepth === 0) {
          frames.pop();
        }
      }
    }
  }

  const openFrame = frames.at(-1);
  if (openFrame?.escaping) {
    throw new Error('Shell 命令解析异常: 末尾存在未完成的反斜杠转义');
  }
  if (pendingHeredocs.length > 0) {
    throw new Error(
      `Shell 命令解析异常: here-doc 未终止 ${pendingHeredocs[0].delimiter}`,
    );
  }
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (frame.quote === 'single') {
      throw new Error('Shell 命令解析异常: 单引号未闭合');
    }
    if (frame.quote === 'double') {
      throw new Error('Shell 命令解析异常: 双引号未闭合');
    }
    if (frame.kind === 'backtick') {
      throw new Error('Shell 命令解析异常: 反引号命令替换未终止');
    }
    if (frame.kind === 'command-substitution') {
      throw new Error('Shell 命令解析异常: 命令替换未终止');
    }
    if (frame.kind === 'arithmetic') {
      throw new Error('Shell 命令解析异常: 算术展开未终止');
    }
  }
}

function createShellFrame(kind: ShellFrame['kind'], parenDepth = 0): ShellFrame {
  return { kind, quote: 'plain', escaping: false, parenDepth };
}

function readPlaceholderToken(command: string, index: number): string | null {
  const match = /^<[A-Za-z][A-Za-z0-9_-]*>/.exec(command.slice(index));
  if (!match) {
    return null;
  }
  if (command[index - 1] === '=') {
    return match[0];
  }
  const next = command[index + match[0].length];
  if (next === undefined || /[\r\n;&|)]/.test(next)) {
    return match[0];
  }
  if (next === ' ' || next === '\t') {
    return hasRedirectionTargetAfter(command, index + match[0].length) ? null : match[0];
  }
  return null;
}

function hasRedirectionTargetAfter(command: string, index: number): boolean {
  let cursor = index;
  while (command[cursor] === ' ' || command[cursor] === '\t') {
    cursor += 1;
  }
  return command[cursor] !== undefined && !/[;&|()<>\r\n]/.test(command[cursor]);
}

function readHeredoc(
  command: string,
  index: number,
): { pending: HeredocMarker; endIndex: number } | null {
  if (command[index + 1] !== '<' || command[index + 2] === '<') {
    return null;
  }
  let cursor = index + 2;
  const stripLeadingTabs = command[cursor] === '-';
  if (stripLeadingTabs) {
    cursor += 1;
  }
  while (command[cursor] === ' ' || command[cursor] === '\t') {
    cursor += 1;
  }
  const delimiter = readHeredocDelimiter(command, cursor);
  if (!delimiter) {
    throw new Error('Shell 命令解析异常: 缺少 here-doc 定界符');
  }
  return {
    pending: { delimiter: delimiter.value, stripLeadingTabs },
    endIndex: delimiter.endIndex,
  };
}

function readHeredocDelimiter(
  command: string,
  index: number,
): { value: string; endIndex: number } | null {
  let cursor = index;
  let delimiter = '';
  let quote: ShellQuoteState = 'plain';
  let escaping = false;
  while (cursor < command.length) {
    const char = command[cursor];
    if (escaping) {
      delimiter += char;
      escaping = false;
      cursor += 1;
      continue;
    }
    if (quote === 'single') {
      if (char === "'") {
        quote = 'plain';
      } else {
        delimiter += char;
      }
      cursor += 1;
      continue;
    }
    if (quote === 'double') {
      if (char === '"') {
        quote = 'plain';
      } else if (char === '\\') {
        escaping = true;
      } else {
        delimiter += char;
      }
      cursor += 1;
      continue;
    }
    if (char === '\\') {
      escaping = true;
      cursor += 1;
      continue;
    }
    if (char === "'") {
      quote = 'single';
      cursor += 1;
      continue;
    }
    if (char === '"') {
      quote = 'double';
      cursor += 1;
      continue;
    }
    if (isHeredocDelimiterTerminator(char)) {
      break;
    }
    delimiter += char;
    cursor += 1;
  }
  if (quote !== 'plain' || escaping) {
    throw new Error('Shell 命令解析异常: here-doc 定界符未终止');
  }
  return delimiter ? { value: delimiter, endIndex: cursor } : null;
}

function isHeredocDelimiterTerminator(char: string | undefined): boolean {
  return (
    char === undefined || /\s/.test(char) || [';', '&', '|', '(', ')', '<', '>'].includes(char)
  );
}

function skipHeredocBodies(
  command: string,
  index: number,
  pendingHeredocs: PendingHeredoc[],
): number {
  let cursor = index;
  for (const pending of pendingHeredocs) {
    let found = false;
    while (cursor <= command.length) {
      const lineEnd = command.indexOf('\n', cursor);
      const endIndex = lineEnd === -1 ? command.length : lineEnd;
      const rawLine = command.slice(cursor, endIndex);
      const normalizedLine = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      const line = pending.stripLeadingTabs ? normalizedLine.replace(/^\t+/, '') : normalizedLine;
      cursor = lineEnd === -1 ? command.length : lineEnd + 1;
      if (line === pending.delimiter) {
        found = true;
        break;
      }
      if (lineEnd === -1) {
        break;
      }
    }
    if (!found) {
      throw new Error(
        `Shell 命令解析异常: here-doc 未终止 ${pending.delimiter}`,
      );
    }
  }
  return cursor;
}

function isShellCommentStart(command: string, index: number): boolean {
  const previous = command[index - 1];
  return previous === undefined || /[\s;&|()]/.test(previous);
}

function skipShellComment(command: string, index: number): number {
  const newlineIndex = command.indexOf('\n', index);
  return newlineIndex === -1 ? command.length : newlineIndex;
}

// === SSH 沙箱传输类 ===

/**
 * SSH 沙箱传输
 *
 * 封装远程 SSH 沙箱的配置生成、命令校验、远程执行与工作区上传。
 * 传输实例会按远程主机缓存临时 SSH 会话，重复执行时复用同一份配置文件。
 */
export class SshSandboxTransport {
  private sessions = new Map<string, SshSandboxSession>();

  /**
   * 生成临时 SSH 配置文件
   * @param remoteHost 远程主机，形如 user@host:port
   * @param options 配置选项
   * @returns SSH 会话描述
   */
  async generateSshConfig(
    remoteHost: string,
    options: SshSandboxConfigOptions = {},
  ): Promise<SshSandboxSession> {
    const parsed = parseRemoteHost(remoteHost);
    const configDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'cross-wms-sandbox-ssh-'),
    );
    try {
      const hostAlias = 'cross-wms-sandbox';
      const configPath = path.join(configDir, 'config');
      const strict = options.strictHostKeyChecking ?? false;
      const lines = [
        `Host ${hostAlias}`,
        `  HostName ${parsed.host}`,
        `  Port ${parsed.port ?? 22}`,
        '  BatchMode yes',
        `  ConnectTimeout ${options.connectTimeout ?? 5}`,
        '  ServerAliveInterval 15',
        '  ServerAliveCountMax 3',
        `  StrictHostKeyChecking ${strict ? 'yes' : 'no'}`,
      ];
      if (parsed.user) {
        lines.push(`  User ${parsed.user}`);
      }
      if (options.knownHostsFile) {
        lines.push(`  UserKnownHostsFile ${options.knownHostsFile}`);
      } else if (!strict) {
        lines.push('  UserKnownHostsFile /dev/null');
      }
      if (options.identityFile) {
        lines.push(`  IdentityFile ${options.identityFile}`);
        lines.push('  IdentitiesOnly yes');
      }
      await fs.writeFile(configPath, `${lines.join('\n')}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await fs.chmod(configPath, 0o600);
      const session = { configPath, hostAlias };
      this.sessions.set(remoteHost, session);
      return session;
    } catch (error) {
      await fs.rm(configDir, { recursive: true, force: true });
      throw error;
    }
  }

  /**
   * 校验远程 shell 片段
   * @param remoteHost 远程主机（用于错误上下文）
   * @param command 待校验的 shell 命令片段
   * @returns 校验结果
   */
  validateRemoteShell(remoteHost: string, command: string): ShellValidationResult {
    const result = validateShellCommand(command);
    if (!result.valid) {
      return {
        valid: false,
        reason: `远程主机 ${remoteHost} 的 shell 片段校验失败: ${result.reason}`,
      };
    }
    return { valid: true };
  }

  /**
   * 执行远程命令
   * @param remoteHost 远程主机
   * @param command 远程 shell 命令
   * @param options 执行选项
   * @returns 命令执行结果
   */
  async executeRemote(
    remoteHost: string,
    command: string,
    options: SshSandboxExecOptions = {},
  ): Promise<SshSandboxCommandResult> {
    const validation = this.validateRemoteShell(remoteHost, command);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }
    const session = await this.getOrCreateSession(remoteHost);
    const argv = this.buildSshArgv(session, command, options.tty);
    return await new Promise<SshSandboxCommandResult>((resolve, reject) => {
      const child = spawn(argv[0], argv.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: options.signal,
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
      child.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));
      child.on('error', reject);
      child.on('close', (code) => {
        const stdout = Buffer.concat(stdoutChunks);
        const stderr = Buffer.concat(stderrChunks);
        const exitCode = code ?? 0;
        if (exitCode !== 0 && !options.allowFailure) {
          reject(
            Object.assign(
              new Error(this.buildFailureMessage(stderr.toString('utf8'), exitCode)),
              { code: exitCode, stdout, stderr },
            ),
          );
          return;
        }
        resolve({ stdout, stderr, code: exitCode });
      });
      if (options.stdin !== undefined) {
        child.stdin.end(options.stdin);
        return;
      }
      child.stdin.end();
    });
  }

  /**
   * 上传工作区目录树到远程沙箱
   * @param remoteHost 远程主机
   * @param localPath 本地目录路径
   * @param remotePath 远程目标目录路径
   */
  async uploadWorkspace(
    remoteHost: string,
    localPath: string,
    remotePath: string,
  ): Promise<void> {
    await assertSafeUploadSymlinks(localPath);
    const session = await this.getOrCreateSession(remoteHost);
    const remoteCommand = buildRemoteCommand([
      '/bin/sh',
      '-c',
      'mkdir -p -- "$1" && tar -xf - -C "$1"',
      'cross-wms-sandbox-upload',
      remotePath,
    ]);
    const sshArgv = this.buildSshArgv(session, remoteCommand);
    await new Promise<void>((resolve, reject) => {
      const tar = spawn('tar', ['-C', localPath, '-cf', '-', '.'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const ssh = spawn(sshArgv[0], sshArgv.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const tarStderr: Buffer[] = [];
      const sshStdout: Buffer[] = [];
      const sshStderr: Buffer[] = [];
      let tarClosed = false;
      let sshClosed = false;
      let tarCode = 0;
      let sshCode = 0;

      tar.stderr.on('data', (chunk) => tarStderr.push(Buffer.from(chunk)));
      ssh.stdout.on('data', (chunk) => sshStdout.push(Buffer.from(chunk)));
      ssh.stderr.on('data', (chunk) => sshStderr.push(Buffer.from(chunk)));

      const fail = (error: unknown) => {
        tar.kill('SIGKILL');
        ssh.kill('SIGKILL');
        reject(toErrorObject(error, '上传过程中出现非 Error 异常'));
      };

      tar.on('error', fail);
      ssh.on('error', fail);
      tar.stdout.pipe(ssh.stdin);

      tar.on('close', (code) => {
        tarClosed = true;
        tarCode = code ?? 0;
        maybeResolve();
      });
      ssh.on('close', (code) => {
        sshClosed = true;
        sshCode = code ?? 0;
        maybeResolve();
      });

      function maybeResolve() {
        if (!tarClosed || !sshClosed) {
          return;
        }
        if (tarCode !== 0) {
          reject(
            new Error(
              Buffer.concat(tarStderr).toString('utf8').trim() ||
                `tar 退出码 ${tarCode}`,
            ),
          );
          return;
        }
        if (sshCode !== 0) {
          reject(
            new Error(
              Buffer.concat(sshStderr).toString('utf8').trim() ||
                `ssh 退出码 ${sshCode}`,
            ),
          );
          return;
        }
        resolve();
      }
    });
  }

  /**
   * 释放指定远程主机的临时会话，或全部会话
   * @param remoteHost 指定主机则仅清理该会话，否则清理全部
   */
  async dispose(remoteHost?: string): Promise<void> {
    const targets = remoteHost ? [remoteHost] : [...this.sessions.keys()];
    for (const host of targets) {
      const session = this.sessions.get(host);
      if (!session) continue;
      this.sessions.delete(host);
      await fs.rm(path.dirname(session.configPath), {
        recursive: true,
        force: true,
      });
    }
  }

  /** 获取或创建会话 */
  private async getOrCreateSession(remoteHost: string): Promise<SshSandboxSession> {
    const existing = this.sessions.get(remoteHost);
    if (existing) {
      return existing;
    }
    return this.generateSshConfig(remoteHost);
  }

  /** 构造 ssh 调用参数 */
  private buildSshArgv(
    session: SshSandboxSession,
    remoteCommand: string,
    tty?: boolean,
  ): string[] {
    return [
      'ssh',
      '-F',
      session.configPath,
      ...(tty
        ? ['-tt', '-o', 'RequestTTY=force', '-o', 'SetEnv=TERM=xterm-256color']
        : ['-T', '-o', 'RequestTTY=no']),
      session.hostAlias,
      remoteCommand,
    ];
  }

  /** 构造 SSH 失败消息 */
  private buildFailureMessage(stderr: string, exitCode?: number): string {
    const trimmed = stderr.trim();
    if (
      trimmed.includes('error in libcrypto') &&
      (trimmed.includes('Load key "') ||
        trimmed.includes('Permission denied (publickey)'))
    ) {
      return `${trimmed}\nSSH 沙箱加载私钥失败，密钥内容可能格式异常（如包含 CRLF 或转义换行），建议优先使用 identityFile。`;
    }
    return (
      trimmed ||
      (exitCode !== undefined
        ? `ssh 退出码 ${exitCode}`
        : 'ssh 以非零状态退出')
    );
  }
}

/** 校验上传目录中的符号链接不会逃逸出工作区根目录 */
async function assertSafeUploadSymlinks(localDir: string): Promise<void> {
  const rootDir = path.resolve(localDir);
  await walkDirectory(rootDir);

  async function walkDirectory(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isSymbolicLink()) {
        // 远程 tar 解包会按链接目标字符串重建符号链接，需确保目标不逃逸工作区树
        try {
          const target = await fs.readlink(entryPath);
          const resolvedTarget = path.resolve(path.dirname(entryPath), target);
          assertPathWithinBoundary(resolvedTarget, rootDir);
        } catch (error) {
          const relativePath = path.relative(rootDir, entryPath).split(path.sep).join('/');
          throw new Error(
            `SSH 沙箱上传拒绝逃逸工作区的符号链接: ${relativePath}`,
            { cause: error },
          );
        }
        continue;
      }
      if (entry.isDirectory()) {
        await walkDirectory(entryPath);
      }
    }
  }
}
