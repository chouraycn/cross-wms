/**
 * Shell 补全脚本生成、安装与卸载。
 *
 * 参考 openclaw/src/cli/completion-cli.ts 与 completion-runtime.ts 的实现思路，
 * 但去除对 openclaw 内部模块的依赖，改为自包含实现，仅依赖 commander 与 Node 内置模块。
 *
 * 支持的 shell：bash、fish、zsh。
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command, type Option, type Command as CommanderCommand } from 'commander';

/** 受支持的 shell 类型 */
export type CompletionShell = 'bash' | 'fish' | 'zsh';

/** 受支持的 shell 列表（用于校验与遍历） */
export const COMPLETION_SHELLS: readonly CompletionShell[] = ['bash', 'fish', 'zsh'];

/** CLI 二进制名称（与 cli/src/index.ts 中 program.name() 保持一致） */
const BIN_NAME = 'crosswms';

/** 补全块在 shell profile 中的注释头，用于定位与移除 */
const COMPLETION_PROFILE_HEADER = '# Cross-WMS Completion';

/**
 * 判断给定字符串是否为受支持的 shell。
 * 同时起到类型守卫的作用。
 */
export function isCompletionShell(value: string): value is CompletionShell {
  return (COMPLETION_SHELLS as readonly string[]).includes(value);
}

/**
 * 根据环境变量推断当前 shell。
 * 未知 shell 默认回退为 zsh。
 */
export function resolveShellFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CompletionShell {
  const shellPath = env.SHELL ?? '';
  const basename = shellPath ? path.basename(shellPath) : '';
  if (basename === 'zsh') return 'zsh';
  if (basename === 'bash') return 'bash';
  if (basename === 'fish') return 'fish';
  return 'zsh';
}

/**
 * 解析 shell 启动配置文件的路径。
 * - zsh:  ~/.zshrc
 * - bash: ~/.bashrc（不存在时回退到 ~/.bash_profile）
 * - fish: ~/.config/fish/config.fish
 */
export function resolveCompletionProfilePath(
  shell: CompletionShell,
  homeDir: () => string = os.homedir,
): string {
  const home = process.env.HOME || homeDir();
  if (shell === 'zsh') return path.join(home, '.zshrc');
  if (shell === 'bash') return path.join(home, '.bashrc');
  // fish
  return path.join(home, '.config', 'fish', 'config.fish');
}

/**
 * 生成 source 行，用于在 shell profile 中加载补全脚本缓存文件。
 * 不同 shell 语法不同：
 * - fish:  `test -f "X"; and source "X"`
 * - 其它:  `[ -f "X" ] && source "X"`
 */
function formatCompletionSourceLine(shell: CompletionShell, cachePath: string): string {
  if (shell === 'fish') {
    return `test -f "${cachePath}"; and source "${cachePath}"`;
  }
  return `[ -f "${cachePath}" ] && source "${cachePath}"`;
}

/** 格式化重载 shell profile 的提示命令 */
function formatCompletionReloadCommand(shell: CompletionShell, profilePath: string): string {
  if (shell === 'fish') {
    return `source ${profilePath}`;
  }
  return `source ${profilePath}`;
}

/**
 * 生成 bash 补全脚本。
 * 采用简化的动态补全：罗列顶层子命令与选项。
 */
function generateBashCompletion(program: CommanderCommand): string {
  const rootCmd = program.name();
  const subCommands = program.commands.map((c) => c.name());
  const options = program.options.map((o) => preferredCompletionFlag(o));
  const allOpts = [...subCommands, ...options].join(' ');

  // 每个子命令的可选项（顶层展开）
  const subCases = program.commands
    .map((cmd) => {
      const opts = [
        ...cmd.commands.map((c) => c.name()),
        ...cmd.options.map((o) => preferredCompletionFlag(o)),
      ].join(' ');
      return `        ${cmd.name()})
            opts="${opts}"
            ;;`;
    })
    .join('\n');

  return `# ${rootCmd} bash completion
_${rootCmd}_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    opts="${allOpts}"

    case "\${prev}" in
${subCases}
    esac

    if [[ \${cur} == -* ]]; then
        COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
        return 0
    fi

    COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
    return 0
}

complete -F _${rootCmd}_completion ${rootCmd}
`;
}

/**
 * 生成 fish 补全脚本。
 * 遍历命令树，为每个层级的子命令与选项生成对应的 complete 行。
 */
function generateFishCompletion(program: CommanderCommand): string {
  const rootCmd = program.name();
  const segments: string[] = [];

  const visit = (cmd: CommanderCommand, parents: string[]) => {
    // 根命令层
    if (parents.length === 0) {
      for (const sub of cmd.commands) {
        segments.push(
          buildFishSubcommandLine(rootCmd, '__fish_use_subcommand', sub.name(), sub.description()),
        );
      }
      for (const opt of cmd.options) {
        segments.push(
          buildFishOptionLine(rootCmd, '__fish_use_subcommand', opt.flags, opt.description),
        );
      }
    } else {
      // 构造条件：仅当命令路径匹配时才触发
      const condition = buildFishPathCondition(rootCmd, parents);
      for (const sub of cmd.commands) {
        segments.push(buildFishSubcommandLine(rootCmd, condition, sub.name(), sub.description()));
      }
      for (const opt of cmd.options) {
        segments.push(buildFishOptionLine(rootCmd, condition, opt.flags, opt.description));
      }
    }

    // 递归子命令
    for (const sub of cmd.commands) {
      visit(sub, parents.length === 0 ? [sub.name()] : [...parents, sub.name()]);
    }
  };

  visit(program, []);
  return segments.join('\n') + '\n';
}

/** 构造 fish 子命令补全行 */
function buildFishSubcommandLine(
  rootCmd: string,
  condition: string,
  name: string,
  description: string,
): string {
  const desc = escapeFishDescription(description);
  return `complete -c ${rootCmd} -n '${condition}' -f -a '${name}' -d '${desc}'`;
}

/** 构造 fish 选项补全行 */
function buildFishOptionLine(
  rootCmd: string,
  condition: string,
  flags: string,
  description: string,
): string {
  const parts = flags.split(/[ ,|]+/).filter((f) => f.startsWith('-'));
  const desc = escapeFishDescription(description);
  const reqArg = ' -r';
  return `complete -c ${rootCmd} -n '${condition}'${reqArg} -d '${desc}' ${parts
    .map((p) => `-l ${p.replace(/^--/, '')}`)
    .join(' ')}`;
}

/** 构造 fish 命令路径匹配条件 */
function buildFishPathCondition(rootCmd: string, parents: readonly string[]): string {
  // 简化条件：使用 __fish_seen_subcommand_from 判断父命令路径
  const chain = parents.map((p) => `__fish_seen_subcommand_from ${p}`).join('; and ');
  return chain || '__fish_use_subcommand';
}

/** 转义 fish 描述中的单引号 */
function escapeFishDescription(desc: string): string {
  return desc.replace(/'/g, "\\'");
}

/**
 * 生成 zsh 补全脚本。
 * 使用 _arguments 风格，递归生成各层子命令的处理函数。
 */
function generateZshCompletion(program: CommanderCommand): string {
  const rootCmd = program.name();
  const subcmdList = generateZshSubcmdList(program);
  const args = generateZshArgs(program);
  const subFuncs = generateZshSubcommands(program, rootCmd);

  return `#compdef ${rootCmd}

_${rootCmd}_root_completion() {
  local -a commands
  local -a options

  _arguments -C \\
    ${args} \\
    ${subcmdList} \\
    "*::arg:->args"

  case $state in
    (args)
      case $line[1] in
        ${program.commands.map((cmd) => `(${cmd.name()}) _${rootCmd}_${cmd.name().replace(/-/g, '_')} ;;`).join('\n        ')}
      esac
      ;;
  esac
}

${subFuncs}

_${rootCmd}_register_completion() {
  if (( ! $+functions[compdef] )); then
    return 0
  fi
  compdef _${rootCmd}_root_completion ${rootCmd}
  precmd_functions=(\${precmd_functions:#_${rootCmd}_register_completion})
  unfunction _${rootCmd}_register_completion 2>/dev/null
}

_${rootCmd}_register_completion
if (( ! $+functions[compdef] )); then
  typeset -ga precmd_functions
  if [[ -z "\${precmd_functions[(r)_${rootCmd}_register_completion]}" ]]; then
    precmd_functions+=(_${rootCmd}_register_completion)
  fi
fi
`;
}

/** 生成 zsh 选项参数描述 */
function generateZshArgs(cmd: CommanderCommand): string {
  const parts = (cmd.options || []).map((opt) => {
    const flags = opt.flags.split(/[ ,|]+/);
    const long = flags.find((f) => f.startsWith('--'));
    const short = flags.find((f) => f.startsWith('-') && !f.startsWith('--'));
    const desc = escapeZshDescription(opt.description);
    if (long && short) {
      return `"(${long} ${short}){${long},${short}}[${desc}]"`;
    }
    if (long) {
      return `"${long}[${desc}]"`;
    }
    return `"${flags[0]}[${desc}]"`;
  });
  return parts.join(' \\\n    ');
}

/** 生成 zsh 子命令列表（用于顶层 _values） */
function generateZshSubcmdList(cmd: CommanderCommand): string {
  const list = cmd.commands
    .map((c) => {
      const desc = escapeZshDescription(c.description());
      return `'${c.name()}[${desc}]'`;
    })
    .join(' ');
  return `"1: :_values 'command' ${list}"`;
}

/** 递归生成 zsh 子命令处理函数 */
function generateZshSubcommands(program: CommanderCommand, prefix: string): string {
  const segments: string[] = [];

  const visit = (current: CommanderCommand, currentPrefix: string) => {
    for (const cmd of current.commands) {
      const cmdName = cmd.name();
      const nextPrefix = `${currentPrefix}_${cmdName.replace(/-/g, '_')}`;
      const funcName = `_${nextPrefix}`;

      visit(cmd, nextPrefix);

      const subCommands = cmd.commands;
      const args = generateZshArgs(cmd);
      if (subCommands.length > 0) {
        const subList = generateZshSubcmdList(cmd);
        const cases = subCommands
          .map((sub) => `(${sub.name()}) ${funcName}_${sub.name().replace(/-/g, '_')} ;;`)
          .join('\n        ');
        segments.push(`
${funcName}() {
  local -a commands
  local -a options

  _arguments -C \\
    ${args} \\
    ${subList} \\
    "*::arg:->args"

  case $state in
    (args)
      case $line[1] in
        ${cases}
      esac
      ;;
  esac
}
`);
        continue;
      }

      segments.push(`
${funcName}() {
  _arguments -C \\
    ${args}
}
`);
    }
  };

  visit(program, prefix);
  return segments.join('');
}

/** 转义 zsh 描述中的特殊字符 */
function escapeZshDescription(desc: string): string {
  return desc
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

/** 从选项 flags 中取首选补全标识（优先长选项） */
function preferredCompletionFlag(option: Option): string {
  const parts = option.flags.split(/[ ,|]+/).filter(Boolean);
  return parts.find((p) => p.startsWith('--')) ?? parts[0] ?? option.flags;
}

/**
 * 生成指定 shell 的补全脚本。
 * 不支持的 shell 会抛出错误。
 */
export function generateCompletion(shell: CompletionShell, program?: CommanderCommand): string {
  if (!isCompletionShell(shell)) {
    throw new Error(`Unsupported shell: ${shell}`);
  }
  // 默认使用一个仅含基本信息的 commander 实例
  const cmd = program ?? createDefaultProgram();
  if (shell === 'bash') return generateBashCompletion(cmd);
  if (shell === 'fish') return generateFishCompletion(cmd);
  return generateZshCompletion(cmd);
}

/** 创建一个包含默认子命令信息的 commander 实例（用于无外部 program 时生成脚本） */
function createDefaultProgram(): CommanderCommand {
  const program = new Command();
  program.name(BIN_NAME);
  program.description('CLI tools for cdf-know');
  // 顶层常用选项
  program.option('-h, --help', '显示帮助');
  program.option('-v, --version', '显示版本号');
  // 注册与 cli/src/index.ts 一致的顶层子命令名称
  const names = [
    'agent',
    'config',
    'completion',
    'cron',
    'daemon',
    'doctor',
    'extension',
    'gateway',
    'models',
    'nodes',
    'plugin',
    'skills',
    'status',
    'tui',
    'version',
  ];
  for (const name of names) {
    program.command(name).description(`${name} 子命令`);
  }
  return program;
}

/** 解析补全脚本缓存目录路径 */
function resolveCompletionCacheDir(): string {
  const stateDir = process.env.CROSSWMS_STATE_DIR || path.join(os.homedir(), '.crosswms');
  return path.join(stateDir, 'completions');
}

/** 解析指定 shell 对应的补全脚本缓存文件路径 */
export function resolveCompletionCachePath(shell: CompletionShell, binName: string = BIN_NAME): string {
  const ext = shell === 'fish' ? 'fish' : shell === 'bash' ? 'bash' : 'zsh';
  return path.join(resolveCompletionCacheDir(), `${binName}.${ext}`);
}

/** 判断路径是否存在 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 安装指定 shell 的补全脚本。
 *
 * 流程：
 *  1. 生成补全脚本并写入缓存文件（若缓存不存在则自动生成）
 *  2. 读取 shell profile，移除旧的补全块，写入新的 source 行
 *  3. 若 profile 不存在则创建
 *
 * 返回安装结果信息。
 */
export async function installCompletion(
  shell: CompletionShell,
  options: { yes?: boolean; program?: CommanderCommand; binName?: string } = {},
): Promise<{ profilePath: string; cachePath: string; installed: boolean }> {
  if (!isCompletionShell(shell)) {
    throw new Error(`Automated installation not supported for ${shell}. Supported: ${COMPLETION_SHELLS.join(', ')}`);
  }

  const binName = options.binName ?? BIN_NAME;
  const yes = options.yes ?? false;
  const cachePath = resolveCompletionCachePath(shell, binName);

  // 确保缓存文件存在（不存在则即时生成）
  if (!(await pathExists(cachePath))) {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    const script = generateCompletion(shell, options.program);
    await fs.writeFile(cachePath, script, 'utf-8');
  }

  const profilePath = resolveCompletionProfilePath(shell);
  const sourceLine = formatCompletionSourceLine(shell, cachePath);

  // 确保 profile 文件存在
  if (!(await pathExists(profilePath))) {
    await fs.mkdir(path.dirname(profilePath), { recursive: true });
    await fs.writeFile(profilePath, '', 'utf-8');
    if (!yes) {
      console.warn(`[completion] Profile not found at ${profilePath}. Created a new one.`);
    }
  }

  const content = await fs.readFile(profilePath, 'utf-8');
  const update = updateCompletionProfile(content, sourceLine);
  if (!update.changed) {
    if (!yes) {
      console.log(`[completion] Already installed in ${profilePath}`);
    }
    return { profilePath, cachePath, installed: false };
  }

  if (!yes) {
    const action = update.hadExisting ? 'Updating' : 'Installing';
    console.log(`[completion] ${action} completion in ${profilePath}...`);
  }

  await fs.writeFile(profilePath, update.next, 'utf-8');
  if (!yes) {
    console.log(
      `[completion] Done. Restart your shell or run: ${formatCompletionReloadCommand(shell, profilePath)}`,
    );
  }
  return { profilePath, cachePath, installed: true };
}

/**
 * 卸载指定 shell 的补全脚本。
 *
 * 流程：
 *  1. 从 shell profile 中移除补全块
 *  2. 可选删除缓存文件
 *
 * 返回卸载结果信息。
 */
export async function uninstallCompletion(
  shell: CompletionShell,
  options: { yes?: boolean; removeCache?: boolean; binName?: string } = {},
): Promise<{ profilePath: string; removed: boolean; cacheRemoved: boolean }> {
  if (!isCompletionShell(shell)) {
    throw new Error(`Automated uninstall not supported for ${shell}. Supported: ${COMPLETION_SHELLS.join(', ')}`);
  }

  const binName = options.binName ?? BIN_NAME;
  const yes = options.yes ?? false;
  const removeCache = options.removeCache ?? false;
  const profilePath = resolveCompletionProfilePath(shell);

  if (!(await pathExists(profilePath))) {
    if (!yes) {
      console.log(`[completion] Profile not found at ${profilePath}; nothing to remove.`);
    }
    return { profilePath, removed: false, cacheRemoved: false };
  }

  const content = await fs.readFile(profilePath, 'utf-8');
  const update = removeCompletionFromProfile(content);
  if (!update.changed) {
    if (!yes) {
      console.log(`[completion] No completion block found in ${profilePath}.`);
    }
    return { profilePath, removed: false, cacheRemoved: false };
  }

  await fs.writeFile(profilePath, update.next, 'utf-8');
  if (!yes) {
    console.log(`[completion] Removed completion from ${profilePath}.`);
  }

  let cacheRemoved = false;
  if (removeCache) {
    const cachePath = resolveCompletionCachePath(shell, binName);
    if (await pathExists(cachePath)) {
      await fs.unlink(cachePath);
      cacheRemoved = true;
      if (!yes) {
        console.log(`[completion] Removed cache file ${cachePath}.`);
      }
    }
  }

  return { profilePath, removed: true, cacheRemoved };
}

/**
 * 在 shell profile 内容中插入/更新补全 source 行。
 * 已存在时先移除旧块再追加，保证幂等。
 */
function updateCompletionProfile(
  content: string,
  sourceLine: string,
): { next: string; changed: boolean; hadExisting: boolean } {
  const lines = content.split('\n');
  const filtered: string[] = [];
  let hadExisting = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    // 遇到补全块头时跳过本行与紧随的 source 行
    if (line.trim() === COMPLETION_PROFILE_HEADER) {
      hadExisting = true;
      // 跳过紧跟的 source 行（若存在）
      const nextLine = lines[i + 1] ?? '';
      if (nextLine.includes('source') || nextLine.includes('complete')) {
        i += 1;
      }
      continue;
    }
    // 单独出现的旧 source 行也清理掉
    if (line.includes('crosswms') && (line.includes('completion') || line.includes('source'))) {
      hadExisting = true;
      continue;
    }
    filtered.push(line);
  }

  const trimmed = filtered.join('\n').trimEnd();
  const block = `${COMPLETION_PROFILE_HEADER}\n${sourceLine}`;
  const next = trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
  return { next, changed: next !== content, hadExisting };
}

/** 从 shell profile 内容中移除补全块 */
function removeCompletionFromProfile(content: string): { next: string; changed: boolean } {
  const lines = content.split('\n');
  const filtered: string[] = [];
  let changed = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trim() === COMPLETION_PROFILE_HEADER) {
      changed = true;
      const nextLine = lines[i + 1] ?? '';
      if (nextLine.includes('source') || nextLine.includes('complete')) {
        i += 1;
      }
      continue;
    }
    if (line.includes('crosswms') && (line.includes('completion') || line.includes('source'))) {
      changed = true;
      continue;
    }
    filtered.push(line);
  }

  const next = filtered.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  return { next, changed };
}

/**
 * Commander completion 子命令注册。
 * 与 cross-wms 现有命令风格一致，导出一个 Command 实例。
 */
export const completionCommand = new Command('completion')
  .description('生成 Shell 补全脚本（bash / fish / zsh）')
  .version('1.0.0');

completionCommand
  .option('-s, --shell <shell>', '目标 shell（bash / fish / zsh，默认从 $SHELL 推断）')
  .option('-i, --install', '安装补全到 shell profile')
  .option('-u, --uninstall', '从 shell profile 卸载补全')
  .option('--remove-cache', '卸载时同时删除缓存脚本', false)
  .option('-y, --yes', '跳过确认提示（非交互）', false)
  .action(async (opts) => {
    const shellRaw = (opts.shell as string | undefined) ?? resolveShellFromEnv();
    if (!isCompletionShell(shellRaw)) {
      throw new Error(
        `Unsupported shell: ${shellRaw}. Supported shells: ${COMPLETION_SHELLS.join(', ')}`,
      );
    }
    const shell: CompletionShell = shellRaw;

    if (opts.uninstall) {
      const result = await uninstallCompletion(shell, {
        yes: opts.yes,
        removeCache: opts.removeCache,
      });
      if (!result.removed && !opts.yes) {
        console.log('[completion] Nothing was removed.');
      }
      return;
    }

    if (opts.install) {
      await installCompletion(shell, { yes: opts.yes });
      return;
    }

    // 默认：生成脚本并输出到 stdout
    const script = generateCompletion(shell);
    process.stdout.write(script + '\n');
  });
