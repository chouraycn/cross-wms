// Gateway reload 设置解析器。
// 规范化 watcher/reload handler 的 reload 模式与 debounce 配置。
// 移植自 openclaw/src/gateway/config-reload-settings.ts。
// 依赖调整：../config/types.gateway.js、../config/types.openclaw.js → 本地 _openclaw-stubs.ts。
import type { GatewayReloadMode, OpenClawConfig } from "./_openclaw-stubs.js";

type GatewayReloadSettings = {
  mode: GatewayReloadMode;
  debounceMs: number;
};

const DEFAULT_RELOAD_SETTINGS: GatewayReloadSettings = {
  mode: "hybrid",
  debounceMs: 300,
};

/** 从配置解析 gateway reload 模式/debounce，带边界默认值。 */
export function resolveGatewayReloadSettings(cfg: OpenClawConfig): GatewayReloadSettings {
  const rawMode = cfg.gateway?.reload?.mode;
  const mode =
    rawMode === "off" || rawMode === "restart" || rawMode === "hot" || rawMode === "hybrid"
      ? rawMode
      : DEFAULT_RELOAD_SETTINGS.mode;
  const debounceRaw = cfg.gateway?.reload?.debounceMs;
  const debounceMs =
    typeof debounceRaw === "number" && Number.isFinite(debounceRaw)
      ? Math.max(0, Math.floor(debounceRaw))
      : DEFAULT_RELOAD_SETTINGS.debounceMs;
  return { mode, debounceMs };
}
