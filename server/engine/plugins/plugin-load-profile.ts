/**
 * 插件加载性能分析的共享探针原语。
 *
 * 移植自 openclaw/src/plugins/plugin-load-profile.ts。
 *
 * 所有 plugin-load 探针 — 跨 `src/plugins/loader.ts` 与
 * `src/plugin-sdk/channel-entry-contract.ts` — 在 stderr 上按以下格式
 * 为每次测量发出单行：
 *
 *     [plugin-load-profile] phase=<X> plugin=<Y> elapsedMs=<N> [extras…] source=<S>
 *
 * 同一个 `OPENCLAW_PLUGIN_LOAD_PROFILE=1` env 标志激活所有探针。
 *
 * 抓取这些行的工具（例如 PERF-STARTUP-PLAN.md 性能分析方法论）依赖
 * 字段顺序为：
 *
 *   1. `phase=`
 *   2. `plugin=`
 *   3. `elapsedMs=`
 *   4. 任何调用方提供的 extras（按声明顺序）
 *   5. `source=` 在最后
 *
 * 保持此契约稳定 — 下游解析器依赖它。
 */

export function shouldProfilePluginLoader(): boolean {
  return process.env.OPENCLAW_PLUGIN_LOAD_PROFILE === "1";
}

/**
 * 在 `elapsedMs=` 与 `source=` 之间追加的有序 `[key, value]` 对列表。
 * 使用有序元组（而非 record）以保证字段顺序确定，与对象迭代怪癖无关。
 */
export type PluginLoadProfileExtras = ReadonlyArray<readonly [string, number | string]>;

/** 每次调用的作用域：探针对应的插件与源路径。 */
export type PluginLoadProfileScope = {
  pluginId?: string;
  source: string;
};

/**
 * 作用域绑定的性能分析器 — 用 `phase` + 同步 `run` 调用以计时并发出
 * 已包含绑定 `pluginId` 与 `source` 的 `[plugin-load-profile]` 行。
 * 用 `createProfiler(scope)` 构建一个。
 */
export type PluginLoadProfiler = <T>(
  phase: string,
  run: () => T,
  extras?: PluginLoadProfileExtras,
) => T;

/**
 * 渲染一个 `[plugin-load-profile]` 行。导出以便需要自定义计时拆分
 * （例如 `channel-entry-contract.ts` 中的双计时器探针）的调用方可以
 * 构建自己的 start/stop 逻辑并仍以规范格式发出行。
 */
export function formatPluginLoadProfileLine(params: {
  phase: string;
  pluginId?: string;
  source: string;
  elapsedMs: number;
  extras?: PluginLoadProfileExtras;
}): string {
  const extras = (params.extras ?? [])
    .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(1) : v}`)
    .join(" ");
  const extrasFragment = extras ? ` ${extras}` : "";
  return (
    `[plugin-load-profile] phase=${params.phase} plugin=${params.pluginId ?? "(core)"}` +
    ` elapsedMs=${params.elapsedMs.toFixed(1)}${extrasFragment} source=${params.source}`
  );
}

/**
 * 为单个同步步骤计时并发出 `[plugin-load-profile]` 行。
 * 仅需包装一次调用时使用：
 *
 * ```ts
 * const mod = withProfile(
 *   { pluginId: id, source },
 *   "phase-name",
 *   () => loadIt(),
 * );
 * ```
 *
 * 对于共享相同 `{ pluginId, source }` 作用域的重复调用，优先使用
 * `createProfiler(scope)` 并调用返回的性能分析器。
 *
 * 当 env 标志未设置时，直接运行 `run()` 无计时开销。错误自然传播；
 * 日志行仍通过 `try { … } finally { … }` 发出。
 */
export function withProfile<T>(
  scope: PluginLoadProfileScope,
  phase: string,
  run: () => T,
  extras?: PluginLoadProfileExtras,
): T {
  if (!shouldProfilePluginLoader()) {
    return run();
  }
  const startMs = performance.now();
  try {
    return run();
  } finally {
    const elapsedMs = performance.now() - startMs;
    console.error(
      formatPluginLoadProfileLine({
        phase,
        pluginId: scope.pluginId,
        source: scope.source,
        elapsedMs,
        extras,
      }),
    );
  }
}

/**
 * 构建作用域绑定的性能分析器。适用于几个连续步骤共享相同
 * `{ pluginId, source }` 的情况：
 *
 * ```ts
 * const profile = createProfiler({ pluginId: id, source: importMetaUrl });
 * profile("phase-a", () => stepA());
 * const v = profile("phase-b", () => stepB());
 * ```
 *
 * 每次调用具有与 `withProfile(scope, phase, run)` 相同的语义。
 */
export function createProfiler(scope: PluginLoadProfileScope): PluginLoadProfiler {
  return (phase, run, extras) => withProfile(scope, phase, run, extras);
}
