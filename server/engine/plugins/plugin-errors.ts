/**
 * Plugin SDK 错误类型 — 统一的错误层次结构
 *
 * 为插件运行时、加载器、生命周期、安装管道提供一致的错误类型。
 * 所有错误均继承自 PluginSdkError，便于上层 catch 时统一处理。
 *
 * 与现有 ./types.ts 中 PluginEvent 的 'error' 类型互补：
 * - types.ts 描述数据契约
 * - 本文件描述可抛出的错误对象
 */

/** 所有 Plugin SDK 错误的基类 */
export class PluginSdkError extends Error {
  /** 关联的插件 ID（可能为空） */
  readonly pluginId?: string;
  /** 错误代码（用于程序化处理） */
  readonly code: string;

  constructor(message: string, code: string = 'PLUGIN_SDK_ERROR', pluginId?: string) {
    super(message);
    this.name = 'PluginSdkError';
    this.code = code;
    if (pluginId !== undefined) {
      this.pluginId = pluginId;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 清单校验失败 */
export class PluginManifestError extends PluginSdkError {
  readonly violations: readonly string[];

  constructor(message: string, violations: readonly string[] = [], pluginId?: string) {
    super(message, 'PLUGIN_MANIFEST_ERROR', pluginId);
    this.name = 'PluginManifestError';
    this.violations = violations;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 加载失败（找不到入口、动态导入抛错等） */
export class PluginLoadError extends PluginSdkError {
  readonly entryPath?: string;
  readonly cause?: unknown;

  constructor(message: string, pluginId?: string, entryPath?: string, cause?: unknown) {
    super(message, 'PLUGIN_LOAD_ERROR', pluginId);
    this.name = 'PluginLoadError';
    if (entryPath !== undefined) {
      this.entryPath = entryPath;
    }
    if (cause !== undefined) {
      this.cause = cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 权限被拒绝 */
export class PluginPermissionDeniedError extends PluginSdkError {
  readonly permission: string;

  constructor(message: string, permission: string, pluginId?: string) {
    super(message, 'PLUGIN_PERMISSION_DENIED', pluginId);
    this.name = 'PluginPermissionDeniedError';
    this.permission = permission;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 沙箱执行超时 */
export class PluginSandboxTimeoutError extends PluginSdkError {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number, pluginId?: string) {
    super(message, 'PLUGIN_SANDBOX_TIMEOUT', pluginId);
    this.name = 'PluginSandboxTimeoutError';
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 沙箱资源限制触发（内存/调用次数/熔断） */
export class PluginSandboxResourceError extends PluginSdkError {
  readonly limitKind: 'memory' | 'invocations' | 'fetch' | 'circuit';

  constructor(message: string, limitKind: 'memory' | 'invocations' | 'fetch' | 'circuit', pluginId?: string) {
    super(message, 'PLUGIN_SANDBOX_RESOURCE', pluginId);
    this.name = 'PluginSandboxResourceError';
    this.limitKind = limitKind;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 生命周期状态迁移非法 */
export class PluginLifecycleError extends PluginSdkError {
  readonly fromState: string;
  readonly toState: string;

  constructor(message: string, fromState: string, toState: string, pluginId?: string) {
    super(message, 'PLUGIN_LIFECYCLE_ERROR', pluginId);
    this.name = 'PluginLifecycleError';
    this.fromState = fromState;
    this.toState = toState;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 依赖缺失或版本不兼容 */
export class PluginDependencyError extends PluginSdkError {
  readonly dependencyId: string;
  readonly requiredVersion?: string;
  readonly foundVersion?: string;

  constructor(
    message: string,
    dependencyId: string,
    pluginId?: string,
    requiredVersion?: string,
    foundVersion?: string,
  ) {
    super(message, 'PLUGIN_DEPENDENCY_ERROR', pluginId);
    this.name = 'PluginDependencyError';
    this.dependencyId = dependencyId;
    if (requiredVersion !== undefined) {
      this.requiredVersion = requiredVersion;
    }
    if (foundVersion !== undefined) {
      this.foundVersion = foundVersion;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 安装管道失败（解压失败、manifest 缺失、安全扫描不通过等） */
export class PluginInstallError extends PluginSdkError {
  readonly step: string;

  constructor(message: string, step: string, pluginId?: string) {
    super(message, 'PLUGIN_INSTALL_ERROR', pluginId);
    this.name = 'PluginInstallError';
    this.step = step;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 能力提供者调用失败 */
export class PluginCapabilityError extends PluginSdkError {
  readonly capability: string;

  constructor(message: string, capability: string, pluginId?: string) {
    super(message, 'PLUGIN_CAPABILITY_ERROR', pluginId);
    this.name = 'PluginCapabilityError';
    this.capability = capability;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 通道运行时错误 */
export class PluginChannelError extends PluginSdkError {
  readonly channelId: string;

  constructor(message: string, channelId: string, pluginId?: string) {
    super(message, 'PLUGIN_CHANNEL_ERROR', pluginId);
    this.name = 'PluginChannelError';
    this.channelId = channelId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 将任意 unknown 错误转换为 PluginSdkError */
export function toPluginSdkError(error: unknown, pluginId?: string): PluginSdkError {
  if (error instanceof PluginSdkError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new PluginSdkError(message, 'PLUGIN_UNKNOWN_ERROR', pluginId);
}

/** 判断是否为可恢复错误（非致命） */
export function isRecoverableError(error: unknown): boolean {
  if (error instanceof PluginSdkError) {
    return (
      error.code === 'PLUGIN_SANDBOX_TIMEOUT' ||
      error.code === 'PLUGIN_PERMISSION_DENIED'
    );
  }
  return false;
}
