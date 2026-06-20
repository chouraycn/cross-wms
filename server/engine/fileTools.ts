/**
 * File Tools — 文件系统操作与终端命令执行
 */

/** 列出目录内容 */
export async function handleListDir(args: Record<string, unknown>): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');
  const dirPath = String(args.path || '.');
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return JSON.stringify(entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
    })));
  } catch (e) {
    return JSON.stringify({ error: `无法读取目录: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 读取文件内容 */
export async function handleReadFile(args: Record<string, unknown>): Promise<string> {
  const fs = await import('fs');
  const filePath = String(args.path || '');
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    // 限制返回内容长度，避免超出 token 限制
    const maxLen = 10000;
    if (content.length > maxLen) {
      return content.slice(0, maxLen) + '\n\n[文件过长，已截断...]';
    }
    return content;
  } catch (e) {
    return JSON.stringify({ error: `无法读取文件: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 写入文件（安全限制：仅允许写入用户数据目录和临时目录） */
export async function handleWriteFile(args: Record<string, unknown>): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const filePath = String(args.path || '');
  const content = String(args.content || '');

  // 安全检查：解析为绝对路径
  const resolvedPath = path.resolve(filePath);

  // 允许写入的目录白名单
  const homeDir = os.homedir();
  const allowedDirs = [
    path.join(homeDir, '.cdf-know-clow'),  // 应用数据目录
    path.join(homeDir, 'Desktop'),           // 桌面
    path.join(homeDir, 'Documents'),         // 文档
    path.join(homeDir, 'Downloads'),         // 下载
    '/tmp',                                   // 临时目录
  ];

  const isAllowed = allowedDirs.some(dir => resolvedPath.startsWith(dir + path.sep) || resolvedPath.startsWith(dir + '/'));
  if (!isAllowed) {
    return JSON.stringify({
      error: `安全限制：仅允许写入以下目录：${allowedDirs.map(d => d.replace(homeDir, '~')).join(', ')}`,
    });
  }

  // 禁止写入系统关键路径
  const systemPatterns = ['/etc/', '/usr/', '/bin/', '/sbin/', '/System/', '/Library/', '/var/'];
  for (const sysPath of systemPatterns) {
    if (resolvedPath.startsWith(sysPath)) {
      return JSON.stringify({ error: '安全限制：禁止写入系统目录。' });
    }
  }

  // 限制写入内容大小（最大 1MB）
  const maxSize = 1024 * 1024;
  if (content.length > maxSize) {
    return JSON.stringify({ error: `安全限制：写入内容超过 1MB 限制（当前 ${(content.length / 1024).toFixed(1)}KB）。` });
  }

  try {
    // 确保父目录存在
    const dir = path.dirname(resolvedPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(resolvedPath, content, 'utf-8');
    return JSON.stringify({ success: true, path: resolvedPath, bytesWritten: content.length });
  } catch (e) {
    return JSON.stringify({ error: `无法写入文件: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 执行终端命令（安全白名单模式） */
export const ALLOWED_COMMANDS = [
  // 文件查看
  'ls', 'cat', 'head', 'tail', 'wc', 'file', 'stat',
  // 目录导航
  'pwd', 'cd',
  // 系统信息
  'whoami', 'date', 'df', 'du', 'ps', 'uname', 'hostname',
  // 文本处理（只读）
  'grep', 'find', 'sort', 'uniq', 'diff', 'echo',
  // 开发工具
  'git', 'npm', 'node', 'npx', 'python3', 'python', 'pip',
  // 网络（只读）
  'curl', 'wget', 'ping', 'nslookup', 'dig',
];

/** 危险参数模式 — 即使命令在白名单中，包含这些参数也会被拒绝 */
export const DANGEROUS_ARG_PATTERNS = [
  /rm\s+-rf?\s+/, /-recursive/, /--delete/,
  />\s*\/dev\//, /mkfs/, /dd\s+if=/, /chmod\s+777/,
  /\|\s*sudo/, /;\s*rm/, /\|\s*rm/,
];

export async function handleExecCommand(args: Record<string, unknown>): Promise<string> {
  const { spawn } = await import('child_process');
  const command = String(args.command || '');
  const commandArgs = Array.isArray(args.args) ? args.args.map(String) : [];

  // 安全检查：只允许白名单命令
  const cmdName = command.split(' ')[0];
  if (!ALLOWED_COMMANDS.includes(cmdName)) {
    return JSON.stringify({ error: `命令 '${cmdName}' 不在白名单中。允许的命令: ${ALLOWED_COMMANDS.join(', ')}` });
  }

  // 安全检查：检测危险参数组合
  const fullCommand = `${command} ${commandArgs.join(' ')}`;
  for (const pattern of DANGEROUS_ARG_PATTERNS) {
    if (pattern.test(fullCommand)) {
      return JSON.stringify({ error: `安全限制：检测到危险参数组合，执行已拒绝。` });
    }
  }

  // 安全检查：禁止 shell 注入（; | & ` $() 等）
  const shellInjectionPattern = /[;|&`$]/;
  if (shellInjectionPattern.test(fullCommand)) {
    return JSON.stringify({ error: '安全限制：命令中包含不允许的 shell 特殊字符（; | & ` $）。' });
  }

  return new Promise((resolve) => {
    const child = spawn(cmdName, commandArgs, {
      shell: false,  // 禁用 shell，防止参数注入
      timeout: 30000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout!.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr!.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code: number | null) => {
      const maxLen = 5000;
      const result = {
        exitCode: code,
        stdout: stdout.length > maxLen ? stdout.slice(0, maxLen) + '\n[输出已截断...]' : stdout,
        stderr: stderr.length > maxLen ? stderr.slice(0, maxLen) + '\n[错误输出已截断...]' : stderr,
      };
      resolve(JSON.stringify(result));
    });

    child.on('error', (err: Error) => {
      resolve(JSON.stringify({ error: `执行失败: ${err.message}` }));
    });
  });
}
