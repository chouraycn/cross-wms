/**
 * 定义插件安装安全扫描结果类型。
 *
 * 降级说明：原实现依赖 ../config/types.openclaw.js 的 OpenClawConfig，
 * cross-wms 暂未移植该模块，这里以本地占位类型替代。
 */

/** OpenClaw 配置（降级为 unknown 占位）。 */
export type OpenClawConfig = Record<string, unknown>;

/** 为受信任/操作员路径有意放宽安装安全策略的覆盖项。 */
export type InstallSafetyOverrides = {
  config?: OpenClawConfig;
  dangerouslyForceUnsafeInstall?: boolean;
  trustedSourceLinkedOfficialInstall?: boolean;
};
