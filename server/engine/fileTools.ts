/**
 * File Tools — 文件系统操作与终端命令执行
 */

import { AppPaths, ensureDir } from '../config/appPaths.js';

/** 获取会话生成文件的目录 */
function getGeneratedFilesDir(sessionId?: string): string {
  const path = require('path');
  const baseDir = AppPaths.generatedFilesDir;
  ensureDir(baseDir);
  if (sessionId) {
    const sessionDir = path.join(baseDir, sessionId);
    ensureDir(sessionDir);
    return sessionDir;
  }
  return baseDir;
}

/** 生成文件到工作区（AI 生成内容专用，可在对话中展示和下载） */
export async function handleGenerateFile(args: Record<string, unknown>): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');

  const fileName = String(args.fileName || args.name || '');
  const content = String(args.content || '');
  const sessionId = String(args.sessionId || args.session || 'default');
  const description = String(args.description || '');

  if (!fileName) {
    return JSON.stringify({ error: '请提供文件名 (fileName)' });
  }

  // 安全检查：防止路径遍历
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return JSON.stringify({ error: '文件名不允许包含路径分隔符或 ..' });
  }

  // 限制文件大小（最大 5MB）
  const maxSize = 5 * 1024 * 1024;
  if (content.length > maxSize) {
    return JSON.stringify({ error: `文件内容超过 5MB 限制（当前 ${(content.length / 1024 / 1024).toFixed(2)}MB）` });
  }

  try {
    const sessionDir = getGeneratedFilesDir(sessionId);
    const filePath = path.join(sessionDir, fileName);

    // 如果文件已存在，添加序号后缀
    let finalPath = filePath;
    let finalName = fileName;
    if (fs.existsSync(filePath)) {
      const ext = path.extname(fileName);
      const baseName = path.basename(fileName, ext);
      let counter = 1;
      while (fs.existsSync(path.join(sessionDir, `${baseName}-${counter}${ext}`))) {
        counter++;
      }
      finalName = `${baseName}-${counter}${ext}`;
      finalPath = path.join(sessionDir, finalName);
    }

    await fs.promises.writeFile(finalPath, content, 'utf-8');

    const stats = await fs.promises.stat(finalPath);

    return JSON.stringify({
      success: true,
      fileName: finalName,
      filePath: finalPath,
      fileSize: stats.size,
      sessionId,
      description,
      downloadUrl: `/api/file/generated/${sessionId}/${encodeURIComponent(finalName)}`,
      previewUrl: `/api/file/generated/${sessionId}/${encodeURIComponent(finalName)}?preview=1`,
    });
  } catch (e) {
    return JSON.stringify({ error: `生成文件失败: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 列出生成的文件 */
export async function handleListGeneratedFiles(args: Record<string, unknown>): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');

  const sessionId = String(args.sessionId || args.session || 'default');

  try {
    const sessionDir = getGeneratedFilesDir(sessionId);
    if (!fs.existsSync(sessionDir)) {
      return JSON.stringify({ files: [] });
    }

    const entries = await fs.promises.readdir(sessionDir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(sessionDir, entry.name);
        const stats = await fs.promises.stat(filePath);
        files.push({
          fileName: entry.name,
          fileSize: stats.size,
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString(),
          downloadUrl: `/api/file/generated/${sessionId}/${encodeURIComponent(entry.name)}`,
        });
      }
    }

    // 按修改时间倒序
    files.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return JSON.stringify({ files });
  } catch (e) {
    return JSON.stringify({ error: `列出文件失败: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 读取生成的文件内容 */
export async function handleReadGeneratedFile(args: Record<string, unknown>): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');

  const fileName = String(args.fileName || args.name || '');
  const sessionId = String(args.sessionId || args.session || 'default');

  if (!fileName) {
    return JSON.stringify({ error: '请提供文件名 (fileName)' });
  }

  // 安全检查：防止路径遍历
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return JSON.stringify({ error: '文件名不允许包含路径分隔符或 ..' });
  }

  try {
    const sessionDir = getGeneratedFilesDir(sessionId);
    const filePath = path.join(sessionDir, fileName);

    if (!fs.existsSync(filePath)) {
      return JSON.stringify({ error: '文件不存在' });
    }

    const content = await fs.promises.readFile(filePath, 'utf-8');
    const stats = await fs.promises.stat(filePath);

    // 限制返回内容长度
    const maxLen = 20000;
    const truncated = content.length > maxLen;
    const displayContent = truncated ? content.slice(0, maxLen) + '\n\n[文件过长，已截断...]' : content;

    return JSON.stringify({
      fileName,
      fileSize: stats.size,
      content: displayContent,
      truncated,
      fullContentLength: content.length,
      downloadUrl: `/api/file/generated/${sessionId}/${encodeURIComponent(fileName)}`,
    });
  } catch (e) {
    return JSON.stringify({ error: `读取文件失败: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 更新生成的文件内容 */
export async function handleUpdateGeneratedFile(args: Record<string, unknown>): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');

  const fileName = String(args.fileName || args.name || '');
  const content = String(args.content || '');
  const sessionId = String(args.sessionId || args.session || 'default');

  if (!fileName) {
    return JSON.stringify({ error: '请提供文件名 (fileName)' });
  }

  // 安全检查：防止路径遍历
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return JSON.stringify({ error: '文件名不允许包含路径分隔符或 ..' });
  }

  // 限制文件大小（最大 5MB）
  const maxSize = 5 * 1024 * 1024;
  if (content.length > maxSize) {
    return JSON.stringify({ error: `文件内容超过 5MB 限制（当前 ${(content.length / 1024 / 1024).toFixed(2)}MB）` });
  }

  try {
    const sessionDir = getGeneratedFilesDir(sessionId);
    const filePath = path.join(sessionDir, fileName);

    if (!fs.existsSync(filePath)) {
      return JSON.stringify({ error: '文件不存在，无法更新。请使用 file_generateFile 创建新文件。' });
    }

    await fs.promises.writeFile(filePath, content, 'utf-8');

    const stats = await fs.promises.stat(filePath);

    return JSON.stringify({
      success: true,
      fileName,
      filePath: filePath,
      fileSize: stats.size,
      sessionId,
      downloadUrl: `/api/file/generated/${sessionId}/${encodeURIComponent(fileName)}`,
      previewUrl: `/api/file/generated/${sessionId}/${encodeURIComponent(fileName)}?preview=1`,
    });
  } catch (e) {
    return JSON.stringify({ error: `更新文件失败: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 重命名生成的文件 */
export async function handleRenameGeneratedFile(args: Record<string, unknown>): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');

  const oldName = String(args.oldName || args.from || '');
  const newName = String(args.newName || args.to || '');
  const sessionId = String(args.sessionId || args.session || 'default');

  if (!oldName) {
    return JSON.stringify({ error: '请提供原文件名 (oldName)' });
  }
  if (!newName) {
    return JSON.stringify({ error: '请提供新文件名 (newName)' });
  }

  // 安全检查：防止路径遍历
  if (oldName.includes('..') || oldName.includes('/') || oldName.includes('\\')) {
    return JSON.stringify({ error: '原文件名不允许包含路径分隔符或 ..' });
  }
  if (newName.includes('..') || newName.includes('/') || newName.includes('\\')) {
    return JSON.stringify({ error: '新文件名不允许包含路径分隔符或 ..' });
  }

  try {
    const sessionDir = getGeneratedFilesDir(sessionId);
    const oldPath = path.join(sessionDir, oldName);
    const newPath = path.join(sessionDir, newName);

    if (!fs.existsSync(oldPath)) {
      return JSON.stringify({ error: '原文件不存在' });
    }

    if (fs.existsSync(newPath)) {
      return JSON.stringify({ error: '新文件名已存在' });
    }

    await fs.promises.rename(oldPath, newPath);

    const stats = await fs.promises.stat(newPath);

    return JSON.stringify({
      success: true,
      oldName,
      newName,
      fileSize: stats.size,
      sessionId,
      downloadUrl: `/api/file/generated/${sessionId}/${encodeURIComponent(newName)}`,
      previewUrl: `/api/file/generated/${sessionId}/${encodeURIComponent(newName)}?preview=1`,
    });
  } catch (e) {
    return JSON.stringify({ error: `重命名文件失败: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 删除生成的文件 */
export async function handleDeleteGeneratedFile(args: Record<string, unknown>): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');

  const fileName = String(args.fileName || args.name || '');
  const sessionId = String(args.sessionId || args.session || 'default');

  if (!fileName) {
    return JSON.stringify({ error: '请提供文件名 (fileName)' });
  }

  // 安全检查：防止路径遍历
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return JSON.stringify({ error: '文件名不允许包含路径分隔符或 ..' });
  }

  try {
    const sessionDir = getGeneratedFilesDir(sessionId);
    const filePath = path.join(sessionDir, fileName);

    if (!fs.existsSync(filePath)) {
      return JSON.stringify({ error: '文件不存在' });
    }

    await fs.promises.unlink(filePath);
    return JSON.stringify({ success: true, fileName });
  } catch (e) {
    return JSON.stringify({ error: `删除文件失败: ${e instanceof Error ? e.message : String(e)}` });
  }
}

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
