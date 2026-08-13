/**
 * ExtensionBridge — 扩展能力注册桥接层
 *
 * 将扩展层（extensions/）与 server 端各能力注册表连接：
 *   registerTool        → server/engine/toolRegistry.ts          (Agent 可调用工具)
 *   registerAdapter     → server/adapters/registry.ts            (LLM 适配器)
 *   registerSttAdapter  → server/adapters/registry.ts            (语音转文字)
 *   registerMediaGenAdapter → server/adapters/registry.ts        (图像/视频生成)
 *   registerModel       → server/engine/llm/model-registry.ts    (模型目录)
 *   registerChannel     → server/channels/registry.ts            (消息通道)
 *
 * 每次注册都会记录一个注销句柄；dispose() 时逆序清理，供 ExtensionLoader
 * 在禁用扩展时统一调用，确保扩展禁用后能力从 server 端移除。
 *
 * 时序说明：server 模块通过动态 import 加载（保持扩展层加载期不强依赖 server
 * 启动顺序，且避免循环依赖）。register* 方法同步发起注册并在 pending 数组中
 * 记录进行中的 Promise；ready() 返回全部注册完成后的 Promise，供 ExtensionLoader
 * 在 enable() 中 await，确保返回前能力已真正注册到 server 端。
 *
 * 注册失败仅记录警告而不抛出，避免单个扩展注册失败影响其他扩展。
 */

import type {
  ExtensionBridge,
  BridgeToolDefinition,
  BridgeToolHandler,
  BridgeModel,
} from './extension-types.js';

interface Disposable {
  dispose(): void;
  /** 等待所有进行中的注册完成 */
  ready(): Promise<void>;
  /** 返回该 bridge 注册的工具名列表（供调试/UI 展示） */
  getRegisteredToolNames(): string[];
}

export class ExtensionBridgeImpl implements ExtensionBridge, Disposable {
  private cleanups: Array<() => void> = [];
  private pending: Array<Promise<void>> = [];
  private disposed = false;
  /** 通过 registerTool 注册的工具名（用于展示与冒烟测试） */
  private registeredToolNames: string[] = [];

  constructor(private readonly log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  }) {}

  /** 注册 Agent 可调用工具 */
  registerTool(definition: BridgeToolDefinition, handler: BridgeToolHandler): void {
    if (this.disposed) return;
    const toolName = definition.function.name;
    this.registeredToolNames.push(toolName);
    const p = import('../server/engine/toolRegistry.js')
      .then(({ registerPluginTool }) => {
        const unreg = registerPluginTool(toolName, definition as never, handler as never);
        this.cleanups.push(() => {
          try {
            unreg();
          } catch (e) {
            this.log.warn(`[Bridge] 注销工具 ${toolName} 失败:`, e);
          }
        });
        this.log.info(`[Bridge] 已注册工具: ${toolName}`);
      })
      .catch((e: unknown) => {
        this.log.warn(`[Bridge] 注册工具 ${toolName} 失败（无法加载 toolRegistry）:`, e);
      });
    this.pending.push(p);
  }

  /** 注册 LLM 适配器 */
  registerAdapter(apiType: string, factory: unknown): void {
    if (this.disposed) return;
    const p = import('../server/adapters/registry.js')
      .then(({ registerAdapter, unregisterAdapter }) => {
        registerAdapter(apiType as never, factory as never);
        this.cleanups.push(() => {
          try {
            unregisterAdapter(apiType as never);
          } catch (e) {
            this.log.warn(`[Bridge] 注销适配器 ${apiType} 失败:`, e);
          }
        });
        this.log.info(`[Bridge] 已注册适配器: ${apiType}`);
      })
      .catch((e: unknown) => {
        this.log.warn(`[Bridge] 注册适配器 ${apiType} 失败:`, e);
      });
    this.pending.push(p);
  }

  /** 注册 STT 适配器 */
  registerSttAdapter(apiType: string, factory: unknown): void {
    if (this.disposed) return;
    const p = import('../server/adapters/registry.js')
      .then(({ registerSttAdapter, unregisterSttAdapter }) => {
        registerSttAdapter(apiType as never, factory as never);
        this.cleanups.push(() => {
          try {
            unregisterSttAdapter(apiType as never);
          } catch (e) {
            this.log.warn(`[Bridge] 注销 STT 适配器 ${apiType} 失败:`, e);
          }
        });
        this.log.info(`[Bridge] 已注册 STT 适配器: ${apiType}`);
      })
      .catch((e: unknown) => {
        this.log.warn(`[Bridge] 注册 STT 适配器 ${apiType} 失败:`, e);
      });
    this.pending.push(p);
  }

  /** 注册多媒体生成适配器 */
  registerMediaGenAdapter(apiType: string, factory: unknown): void {
    if (this.disposed) return;
    const p = import('../server/adapters/registry.js')
      .then(({ registerMediaGenAdapter, unregisterMediaGenAdapter }) => {
        registerMediaGenAdapter(apiType as never, factory as never);
        this.cleanups.push(() => {
          try {
            unregisterMediaGenAdapter(apiType as never);
          } catch (e) {
            this.log.warn(`[Bridge] 注销多媒体适配器 ${apiType} 失败:`, e);
          }
        });
        this.log.info(`[Bridge] 已注册多媒体适配器: ${apiType}`);
      })
      .catch((e: unknown) => {
        this.log.warn(`[Bridge] 注册多媒体适配器 ${apiType} 失败:`, e);
      });
    this.pending.push(p);
  }

  /** 注册模型到 modelRegistry */
  registerModel(model: BridgeModel): void {
    if (this.disposed) return;
    const p = import('../server/engine/llm/model-registry.js')
      .then(({ registerModel, modelRegistry }) => {
        registerModel(model as never);
        this.cleanups.push(() => {
          try {
            modelRegistry.unregister(model.id);
          } catch (e) {
            this.log.warn(`[Bridge] 注销模型 ${model.id} 失败:`, e);
          }
        });
        this.log.info(`[Bridge] 已注册模型: ${model.provider}/${model.id}`);
      })
      .catch((e: unknown) => {
        this.log.warn(`[Bridge] 注册模型 ${model.id} 失败:`, e);
      });
    this.pending.push(p);
  }

  /** 注册消息通道 */
  registerChannel(plugin: unknown): void {
    if (this.disposed) return;
    const channelPlugin = plugin as { id: string };
    const p = import('../server/channels/registry.js')
      .then(({ getGlobalChannelRegistry }) => {
        const registry = getGlobalChannelRegistry();
        registry.register(plugin as never);
        this.cleanups.push(() => {
          try {
            registry.unregister(channelPlugin.id);
          } catch (e) {
            this.log.warn(`[Bridge] 注销通道 ${channelPlugin.id} 失败:`, e);
          }
        });
        this.log.info(`[Bridge] 已注册通道: ${channelPlugin.id}`);
      })
      .catch((e: unknown) => {
        this.log.warn('[Bridge] 注册通道失败:', e);
      });
    this.pending.push(p);
  }

  /** 等待所有进行中的注册完成 */
  async ready(): Promise<void> {
    if (this.pending.length === 0) return;
    await Promise.all(this.pending);
    this.pending = [];
  }

  /** 返回该 bridge 注册的工具名列表 */
  getRegisteredToolNames(): string[] {
    return [...this.registeredToolNames];
  }

  /**
   * 注销该 bridge 注册的全部能力。
   *
   * 逆序调用清理句柄（后注册的先清理），保证依赖顺序正确。
   * 幂等：多次调用安全。
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    while (this.cleanups.length > 0) {
      const cleanup = this.cleanups.pop()!;
      try {
        cleanup();
      } catch (e) {
        this.log.warn('[Bridge] 清理句柄失败:', e);
      }
    }
  }
}

/**
 * 创建一个新的 ExtensionBridge 实例。
 *
 * 每个 extension enable 时创建独立 bridge，disable 时调用 dispose() 清理。
 */
export function createExtensionBridge(log: {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}): ExtensionBridgeImpl {
  return new ExtensionBridgeImpl(log);
}
