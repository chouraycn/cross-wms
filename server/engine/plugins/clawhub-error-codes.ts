/** ClawHub 安装错误码，供插件安装策略与诊断稳定使用。 */
export const CLAWHUB_INSTALL_ERROR_CODE = {
  INVALID_SPEC: "invalid_spec",
  PACKAGE_NOT_FOUND: "package_not_found",
  VERSION_NOT_FOUND: "version_not_found",
  NO_INSTALLABLE_VERSION: "no_installable_version",
  SKILL_PACKAGE: "skill_package",
  UNSUPPORTED_FAMILY: "unsupported_family",
  PRIVATE_PACKAGE: "private_package",
  INCOMPATIBLE_PLUGIN_API: "incompatible_plugin_api",
  INCOMPATIBLE_GATEWAY: "incompatible_gateway",
  ARTIFACT_UNAVAILABLE: "artifact_unavailable",
  MISSING_ARCHIVE_INTEGRITY: "missing_archive_integrity",
  ARTIFACT_DOWNLOAD_UNAVAILABLE: "artifact_download_unavailable",
  ARCHIVE_INTEGRITY_MISMATCH: "archive_integrity_mismatch",
} as const;

/** ClawHub 安装错误码取值的联合类型。 */
export type ClawHubInstallErrorCode =
  (typeof CLAWHUB_INSTALL_ERROR_CODE)[keyof typeof CLAWHUB_INSTALL_ERROR_CODE];
