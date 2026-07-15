/**
 * Plugin Registry — 插件注册表（Module-level Singleton）
 *
 * v3.0: 管理插件的全生命周期：install → enable → disable → uninstall。
 * 状态机: installed → enabled → disabled → error
 *
 * - enable 时：读 DB → 解析 manifest_json → 沙箱执行 entry 模块（executeInSandbox）→ 注册 tools
 * - disable 时：注销 tools → 写 DB status=disabled
 * - 任何异常 → status=error + 记录 error_message
 */

import path from 'path';
import fs from 'fs';
import { getPlugin, listEnabledPlugins, updatePlugin, deletePlugin, createPlugin } from '../dao/plugins.js';
import type { PluginRow } from '../db.js';
import { registerPluginTool, unregisterPluginTool } from './toolRegistry.js';
import { installFromZip, installFromGit, installFromNpm } from './pluginLoader.js';
import type { PluginManifest, PluginToolDefinition as PluginToolDef } from '../../shared/pluginManifest.js';
import type { ToolDefinition } from '../aiClient.js';
import { executeInSandbox } from './pluginSandbox.js';
import { logger } from '../logger.js';

/** 插件错误信息记录 */
interface PluginError {
  pluginId: string;
  message: string;
  timestamp: string;
}

/**
 * PluginRegistry 类 — 管理所有插件的注册、启用、禁用、卸载。
 */
class PluginRegistry {
  private static instance: PluginRegistry;

  /** 已加载的插件模块（pluginId → module exports） */
  private loadedModules: Map<string, any> = new Map();

  /** 插件错误记录 */
  private errors: PluginError[] = [];

  /** 已注册的工具名到插件 ID 的映射 */
  private toolToPluginMap: Map<string, string> = new Map();

  private constructor() {}

  /** 获取单例实例 */
  static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  /**
   * 安装插件：解压 + 校验 manifest + 写 DB → status = installed
   *
   * 调用 pluginLoader.installFromZip 执行真实的 zip 解压与 manifest 校验，
   * 然后使用返回的 manifest 信息在 DB 中创建插件记录。
   *
   * @param zipPath - 插件 .zip 包的绝对路径
   * @returns 新创建的 PluginRow
   */
  async install(zipPath: string): Promise<PluginRow> {
    // 1. 调用 pluginLoader.installFromZip 进行解压 + manifest 校验
    const installResult = await installFromZip(zipPath);
    const { manifest, installPath, entryPath, sizeBytes } = installResult;

    // 2. 在 DB 中创建插件记录
    const pluginRow = createPlugin({
      name: manifest.name,
      display_name: manifest.displayName || manifest.name,
      version: manifest.version,
      author: manifest.author,
      description: manifest.description,
      icon: manifest.icon,
      manifest_json: JSON.stringify(manifest),
      entry_path: entryPath,
      install_path: installPath,
      permissions: JSON.stringify(manifest.permissions),
      risk_level: manifest.riskLevel,
      size_bytes: sizeBytes,
      metadata: JSON.stringify(manifest.metadata ?? {}),
    });

    return pluginRow;
  }

  /**
   * 从 Git 仓库安装插件：clone + 校验 manifest + 写 DB → status = installed
   *
   * @param gitUrl - Git 仓库 URL
   * @param options - 可选参数：branch（分支）、subdir（子目录）
   * @returns 新创建的 PluginRow
   */
  async installFromGit(gitUrl: string, options?: { branch?: string; subdir?: string }): Promise<PluginRow> {
    const installResult = await installFromGit(gitUrl, options);
    const { manifest, installPath, entryPath, sizeBytes } = installResult;

    const pluginRow = createPlugin({
      name: manifest.name,
      display_name: manifest.displayName || manifest.name,
      version: manifest.version,
      author: manifest.author,
      description: manifest.description,
      icon: manifest.icon,
      manifest_json: JSON.stringify(manifest),
      entry_path: entryPath,
      install_path: installPath,
      permissions: JSON.stringify(manifest.permissions),
      risk_level: manifest.riskLevel,
      size_bytes: sizeBytes,
      metadata: JSON.stringify(manifest.metadata ?? {}),
    });

    return pluginRow;
  }

  /**
   * 从 npm 安装插件：pack + 解压 + 校验 manifest + 写 DB → status = installed
   *
   * @param packageName - npm 包名
   * @param options - 可选参数：version（版本）
   * @returns 新创建的 PluginRow
   */
  async installFromNpm(packageName: string, options?: { version?: string }): Promise<PluginRow> {
    const installResult = await installFromNpm(packageName, options);
    const { manifest, installPath, entryPath, sizeBytes } = installResult;

    const pluginRow = createPlugin({
      name: manifest.name,
      display_name: manifest.displayName || manifest.name,
      version: manifest.version,
      author: manifest.author,
      description: manifest.description,
      icon: manifest.icon,
      manifest_json: JSON.stringify(manifest),
      entry_path: entryPath,
      install_path: installPath,
      permissions: JSON.stringify(manifest.permissions),
      risk_level: manifest.riskLevel,
      size_bytes: sizeBytes,
      metadata: JSON.stringify(manifest.metadata ?? {}),
    });

    return pluginRow;
  }

  /**
   * 启用插件：加载 entry 模块 + 注册 tools → status = enabled
   *
   * @param id - 插件 ID
   * @returns 更新后的 PluginRow，如果插件不存在则返回 undefined
   */
  async enable(id: string): Promise<PluginRow | undefined> {
    const plugin = getPlugin(id);
    if (!plugin) return undefined;

    // 状态检查：只有 installed / disabled 可以启用
    if (plugin.status !== 'installed' && plugin.status !== 'disabled' && plugin.status !== 'error') {
      return plugin;
    }

    // 跟踪本轮成功注册的工具名，用于失败时精确清理（P1-04）
    const registeredTools: string[] = [];

    try {
      // 1. 解析 manifest_json
      const manifest: PluginManifest = JSON.parse(plugin.manifest_json);

      // 1.5 契约测试：验证插件与宿主环境兼容性
      const contractResult = validatePluginContract(manifest, plugin.install_path);
      if (!contractResult.compatible) {
        throw new Error(
          `插件契约验证失败:\n${contractResult.issues.map((i) => '  - ' + i).join('\n')}`
        );
      }

      // 2. 读取入口文件并在沙箱中执行
      const entryPath = path.join(plugin.install_path, plugin.entry_path);
      if (!fs.existsSync(entryPath)) {
        throw new Error(`插件入口文件不存在: ${entryPath}`);
      }

      // 在 node:vm 沙箱中执行插件代码
      const code = fs.readFileSync(entryPath, 'utf8');
      const sandboxResult = await executeInSandbox(code, manifest);
      if (!sandboxResult.ok) {
        throw new Error(`沙箱执行失败: ${sandboxResult.error}`);
      }
      const moduleExports = sandboxResult.value as Record<string, unknown>;
      this.loadedModules.set(id, moduleExports);

      // 3. 注册每个工具
      for (const toolDef of manifest.tools) {
        const fullToolName = `plugin_${manifest.name}_${toolDef.name}`;

        // 构建 ToolDefinition（与内置工具格式一致）
        const definition: ToolDefinition = {
          type: 'function',
          function: {
            name: fullToolName,
            description: toolDef.description,
            parameters: toolDef.parameters as Record<string, unknown>,
          },
        };

        // 创建 handler — 通过模块的 execute 函数路由
        const handler = async (args: Record<string, unknown>): Promise<string> => {
          return this.invokePluginTool(fullToolName, args);
        };

        // 注册到 toolRegistry
        registerPluginTool(fullToolName, definition, handler);
        this.toolToPluginMap.set(fullToolName, id);
        registeredTools.push(fullToolName);
      }

      // 4. 更新 DB 状态
      const updated = updatePlugin(id, { status: 'enabled' });

      // 5. 清除该插件的错误记录
      this.errors = this.errors.filter(e => e.pluginId !== id);

      return updated;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);

      // 更新 DB 状态为 error
      updatePlugin(id, { status: 'error', metadata: JSON.stringify({ error: errorMsg }) });

      // 记录错误
      this.errors.push({
        pluginId: id,
        message: errorMsg,
        timestamp: new Date().toISOString(),
      });

      // 清理已加载的模块
      this.loadedModules.delete(id);

      // P1-04: 使用注册跟踪列表精确清理，仅移除本轮成功注册的工具
      for (const toolName of registeredTools) {
        unregisterPluginTool(toolName);
        this.toolToPluginMap.delete(toolName);
      }

      return getPlugin(id);
    }
  }

  /**
   * 禁用插件：注销 tools → status = disabled
   *
   * @param id - 插件 ID
   * @returns 更新后的 PluginRow，如果插件不存在则返回 undefined
   */
  async disable(id: string): Promise<PluginRow | undefined> {
    const plugin = getPlugin(id);
    if (!plugin) return undefined;

    // 状态检查：只有 enabled 可以禁用
    if (plugin.status !== 'enabled') {
      return plugin;
    }

    try {
      // 1. 解析 manifest_json 获取工具列表
      const manifest: PluginManifest = JSON.parse(plugin.manifest_json);

      // 2. 注销每个工具
      for (const toolDef of manifest.tools) {
        const fullToolName = `plugin_${manifest.name}_${toolDef.name}`;
        unregisterPluginTool(fullToolName);
        this.toolToPluginMap.delete(fullToolName);
      }

      // 3. 移除已加载的模块
      this.loadedModules.delete(id);

      // 4. 更新 DB 状态
      return updatePlugin(id, { status: 'disabled' });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      updatePlugin(id, { status: 'error', metadata: JSON.stringify({ error: errorMsg }) });
      this.errors.push({
        pluginId: id,
        message: errorMsg,
        timestamp: new Date().toISOString(),
      });
      return getPlugin(id);
    }
  }

  /**
   * 卸载插件：删除文件 + 删除 DB 行
   *
   * @param id - 插件 ID
   * @returns 是否卸载成功
   */
  async uninstall(id: string): Promise<boolean> {
    const plugin = getPlugin(id);
    if (!plugin) return false;

    try {
      // 1. 如果插件是 enabled 状态，先禁用
      if (plugin.status === 'enabled') {
        await this.disable(id);
      }

      // 2. 清理已注册的工具
      this.cleanupPluginTools(id);

      // 3. 删除安装目录
      if (plugin.install_path && fs.existsSync(plugin.install_path)) {
        fs.rmSync(plugin.install_path, { recursive: true, force: true });
      }

      // 4. 移除已加载的模块
      this.loadedModules.delete(id);

      // 5. 清除错误记录
      this.errors = this.errors.filter(e => e.pluginId !== id);

      // 6. 删除 DB 记录
      return deletePlugin(id);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      this.errors.push({
        pluginId: id,
        message: `卸载失败: ${errorMsg}`,
        timestamp: new Date().toISOString(),
      });
      return false;
    }
  }

  /**
   * 获取所有已启用插件的工具定义（用于合并到 LLM 的 tools 列表）
   */
  getActiveTools(): ToolDefinition[] {
    const enabledPlugins = listEnabledPlugins();
    const tools: ToolDefinition[] = [];

    for (const plugin of enabledPlugins) {
      try {
        const manifest: PluginManifest = JSON.parse(plugin.manifest_json);
        for (const toolDef of manifest.tools) {
          const fullToolName = `plugin_${manifest.name}_${toolDef.name}`;
          tools.push({
            type: 'function',
            function: {
              name: fullToolName,
              description: toolDef.description,
              parameters: toolDef.parameters as Record<string, unknown>,
            },
          });
        }
      } catch {
        // 忽略 manifest 解析失败的插件
      }
    }

    return tools;
  }

  /**
   * 获取插件注册表健康状态
   */
  getHealth(): { loaded: number; active: number; errors: string[] } {
    const enabledPlugins = listEnabledPlugins();
    const errorMessages = this.errors.map(
      (e) => `[${e.pluginId}] ${e.message}`
    );

    return {
      loaded: this.loadedModules.size,
      active: enabledPlugins.length,
      errors: errorMessages,
    };
  }

  /**
   * 检查插件是否拥有指定权限。
   *
   * @param pluginId - 插件 ID
   * @param permission - 需要检查的权限标识（如 'fs.read', 'http.request', 模块名等）
   * @returns 是否拥有该权限
   */
  checkPermission(pluginId: string, permission: string): boolean {
    const plugin = getPlugin(pluginId);
    if (!plugin) return false;

    try {
      const manifest: PluginManifest = JSON.parse(plugin.manifest_json);
      // 精确匹配或前缀匹配
      // 例如: 插件声明了 'fs.read'，检查 'fs.read' → 通过
      // 例如: 插件声明了 'http'，检查 'http.request' → 通过（前缀包含）
      return manifest.permissions.some(
        (p) => p === permission || permission.startsWith(p + '.') || p === '*'
      );
    } catch {
      return false;
    }
  }

  /**
   * 调用插件工具（含权限校验）
   *
   * @param toolName - 完整工具名（如 plugin_inventory_check）
   * @param args - 工具参数
   * @returns 工具执行结果（JSON 字符串）
   */
  async invokePluginTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    // 1. 查找工具对应的插件
    const pluginId = this.toolToPluginMap.get(toolName);
    if (!pluginId) {
      return JSON.stringify({ error: `未知插件工具: ${toolName}` });
    }

    // 2. 权限校验 — 检查插件是否有调用该工具的权限
    const permissionCheck = this.checkToolPermission(pluginId, toolName, args);
    if (!permissionCheck.allowed) {
      return JSON.stringify({
        error: `权限拒绝: 插件 '${pluginId}' 缺少权限 — ${permissionCheck.reason}`,
      });
    }

    // 3. 获取已加载的模块
    const moduleExports = this.loadedModules.get(pluginId);
    if (!moduleExports) {
      return JSON.stringify({ error: `插件模块未加载: ${pluginId}` });
    }

    // 4. 查找工具对应的 handler
    const plugin = getPlugin(pluginId);
    if (!plugin) {
      return JSON.stringify({ error: `插件不存在: ${pluginId}` });
    }

    try {
      const manifest: PluginManifest = JSON.parse(plugin.manifest_json);
      // 从工具名中提取短名（去掉 plugin_<name>_ 前缀）
      const prefix = `plugin_${manifest.name}_`;
      const shortToolName = toolName.startsWith(prefix) ? toolName.slice(prefix.length) : toolName;

      // P1-03: 根据 manifest 解析超时时间，为工具调用添加超时保护
      const toolTimeoutMs = resolveToolTimeout(manifest);

      // 5. 调用模块的 execute 函数（带超时保护）
      // 插件模块应导出 execute(toolName: string, args: Record<string, unknown>): Promise<string>
      if (typeof moduleExports.execute === 'function') {
        const result = await callWithTimeout(
          moduleExports.execute(shortToolName, args),
          toolTimeoutMs,
          `插件工具 '${shortToolName}' 执行超时 (${toolTimeoutMs}ms)`
        );
        return typeof result === 'string' ? result : JSON.stringify(result);
      }

      // 也支持直接导出与工具同名的函数（带超时保护）
      if (typeof moduleExports[shortToolName] === 'function') {
        const result = await callWithTimeout(
          moduleExports[shortToolName](args),
          toolTimeoutMs,
          `插件工具 '${shortToolName}' 执行超时 (${toolTimeoutMs}ms)`
        );
        return typeof result === 'string' ? result : JSON.stringify(result);
      }

      return JSON.stringify({
        error: `插件模块未导出 execute 函数或工具函数 '${shortToolName}'`,
      });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return JSON.stringify({ error: `插件工具执行失败: ${errorMsg}` });
    }
  }

  /**
   * 检查插件是否有权调用指定工具。
   *
   * 权限映射规则:
   * - 每个工具调用需要检查对应的风险等级权限
   * - 如果工具 riskLevel 为 'high-risk'，需要 'high-risk' 权限
   * - 如果工具 riskLevel 为 'confirm'，需要 'confirm' 或更高级别权限
   * - 如果工具 riskLevel 为 'auto'，默认允许
   * - args 中如果包含 __permission 额外权限标识，也做校验
   *
   * @param pluginId - 插件 ID
   * @param toolName - 工具名
   * @param args - 调用参数
   * @returns 是否允许及原因
   */
  private checkToolPermission(
    pluginId: string,
    toolName: string,
    _args: Record<string, unknown>,
  ): { allowed: boolean; reason?: string } {
    const plugin = getPlugin(pluginId);
    if (!plugin) {
      return { allowed: false, reason: '插件不存在' };
    }

    try {
      const manifest: PluginManifest = JSON.parse(plugin.manifest_json);

      // 解析 manifest.permissions 列表
      const declaredPermissions = new Set(manifest.permissions);

      // 通配符权限 — 允许一切
      if (declaredPermissions.has('*')) {
        return { allowed: true };
      }

      // 查找该工具的定义，获取其 riskLevel
      const prefix = `plugin_${manifest.name}_`;
      const shortToolName = toolName.startsWith(prefix) ? toolName.slice(prefix.length) : toolName;
      const toolDef = manifest.tools.find((t) => t.name === shortToolName);

      if (!toolDef) {
        // 工具不在 manifest.tools 列表中 — 拒绝
        return { allowed: false, reason: `工具 '${shortToolName}' 未在 manifest.tools 中声明` };
      }

      // 根据工具风险等级校验权限
      const riskLevel = toolDef.riskLevel;
      if (riskLevel === 'high-risk') {
        // 高风险工具需要 'high-risk' 权限
        if (!declaredPermissions.has('high-risk') && !declaredPermissions.has('high-risk.*')) {
          return { allowed: false, reason: `工具 '${shortToolName}' 为高风险，需要 'high-risk' 权限` };
        }
      } else if (riskLevel === 'confirm') {
        // 需确认级工具需要 'confirm' 或 'high-risk' 权限
        if (
          !declaredPermissions.has('confirm') &&
          !declaredPermissions.has('confirm.*') &&
          !declaredPermissions.has('high-risk') &&
          !declaredPermissions.has('high-risk.*')
        ) {
          return { allowed: false, reason: `工具 '${shortToolName}' 需确认，需要 'confirm' 权限` };
        }
      }

      // auto 级别默认允许
      return { allowed: true };
    } catch (e) {
      return { allowed: false, reason: `权限校验异常: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  /**
   * 重新加载插件（disable + enable）
   */
  async reload(id: string): Promise<PluginRow | undefined> {
    const plugin = getPlugin(id);
    if (!plugin) return undefined;

    if (plugin.status === 'enabled') {
      await this.disable(id);
    }
    return this.enable(id);
  }

  /**
   * 启动时自动加载所有已启用的插件
   */
  async loadEnabledPlugins(): Promise<void> {
    const enabledPlugins = listEnabledPlugins();
    for (const plugin of enabledPlugins) {
      try {
        await this.enable(plugin.id);
      } catch (e) {
        logger.error(`[PluginRegistry] 启动加载插件 '${plugin.name}' 失败:`, e);
      }
    }
  }

  /**
   * 清理指定插件的所有已注册工具
   */
  private cleanupPluginTools(pluginId: string): void {
    const toolsToRemove: string[] = [];
    for (const [toolName, pid] of this.toolToPluginMap) {
      if (pid === pluginId) {
        toolsToRemove.push(toolName);
      }
    }
    for (const toolName of toolsToRemove) {
      unregisterPluginTool(toolName);
      this.toolToPluginMap.delete(toolName);
    }
  }
}

// ===================== 插件契约测试 =====================

/** 当前宿主支持的插件 API 版本 */
const SUPPORTED_PLUGIN_API_VERSION = '1.0';

/**
 * 插件兼容性检查结果
 */
export interface PluginCompatibilityResult {
  compatible: boolean;
  issues: string[];
  apiVersion: string;
  requiredApiVersion: string;
}

/**
 * 验证插件 manifest 与宿主环境的兼容性（contract testing 入口）
 *
 * 检查项：
 * 1. apiVersion 是否兼容（主版本号必须一致）
 * 2. tools 定义是否合法（名称唯一、参数合法）
 * 3. permissions 是否包含非法权限
 * 4. entry 文件是否存在
 */
export function validatePluginContract(
  manifest: PluginManifest,
  installPath: string,
): PluginCompatibilityResult {
  const issues: string[] = [];

  // 1. API 版本兼容性检查（主版本号必须一致）
  const hostMajor = SUPPORTED_PLUGIN_API_VERSION.split('.')[0];
  const pluginMajor = manifest.apiVersion.split('.')[0];
  if (hostMajor !== pluginMajor) {
    issues.push(
      `API 版本不兼容: 宿主 ${SUPPORTED_PLUGIN_API_VERSION} vs 插件 ${manifest.apiVersion}`
    );
  }

  // 2. 工具名称唯一性检查
  const toolNames = new Set<string>();
  for (const tool of manifest.tools) {
    if (toolNames.has(tool.name)) {
      issues.push(`工具名称重复: '${tool.name}'`);
    }
    toolNames.add(tool.name);

    // 参数定义合法性检查
    const paramKeys = Object.keys(tool.parameters.properties);
    for (const required of tool.parameters.required) {
      if (!paramKeys.includes(required)) {
        issues.push(`工具 '${tool.name}' 的必填参数 '${required}' 未在 properties 中定义`);
      }
    }
  }

  // 3. 权限合法性检查
  const validPermissionPrefixes = ['fs', 'http', 'net', 'db', 'shell', 'high-risk', 'confirm', '*'];
  for (const perm of manifest.permissions) {
    if (perm === '*') continue;
    const isValid = validPermissionPrefixes.some((p) => perm === p || perm.startsWith(p + '.'));
    if (!isValid) {
      issues.push(`未知权限声明: '${perm}'`);
    }
  }

  // 4. entry 文件存在性检查
  const entryFullPath = path.join(installPath, manifest.entry);
  if (!fs.existsSync(entryFullPath)) {
    issues.push(`入口文件不存在: ${manifest.entry}`);
  }

  return {
    compatible: issues.length === 0,
    issues,
    apiVersion: manifest.apiVersion,
    requiredApiVersion: SUPPORTED_PLUGIN_API_VERSION,
  };
}

// ===================== 辅助函数 =====================

/** 默认工具调用超时（毫秒） */
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

/**
 * 从 manifest 中解析工具调用超时时间。
 *
 * 优先级:
 * 1. manifest.metadata.toolTimeoutMs（数字）
 * 2. manifest.metadata.timeoutMs（数字）
 * 3. DEFAULT_TOOL_TIMEOUT_MS（30s）
 */
function resolveToolTimeout(manifest: PluginManifest): number {
  const metadata = manifest.metadata;
  const toolTimeout = metadata?.toolTimeoutMs;
  if (typeof toolTimeout === 'number' && toolTimeout > 0 && toolTimeout <= 300_000) {
    return toolTimeout;
  }
  const genericTimeout = metadata?.timeoutMs;
  if (typeof genericTimeout === 'number' && genericTimeout > 0 && genericTimeout <= 300_000) {
    return genericTimeout;
  }
  return DEFAULT_TOOL_TIMEOUT_MS;
}

/**
 * 为 Promise 调用添加超时保护。
 *
 * @param promise - 要执行的 Promise
 * @param timeoutMs - 超时时间（毫秒）
 * @param timeoutMessage - 超时错误信息
 * @returns Promise 的结果，超时则抛出错误
 */
function callWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  if (timeoutMs <= 0) {
    return promise;
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/** Module-level singleton */
export const pluginRegistry = PluginRegistry.getInstance();
