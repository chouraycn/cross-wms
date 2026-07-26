// Legacy MCP runtime config migrations for CLI-native transport aliases.
// 移植自 openclaw/src/commands/doctor/shared/legacy-config-migrations.runtime.mcp.ts
//
// 降级说明：
//  - LegacyConfigMigrationSpec / LegacyConfigRule / defineLegacyConfigMigration
//    来自 ../../../config/legacy.shared.js → cross-wms 占位为 unknown，
//    在本文件内提供本地等价类型与 identity 帮助器以保留原迁移逻辑
//  - isRecord 来自 ./legacy-config-record-shared.js → cross-wms 已移植
//  - isKnownCliMcpTypeAlias / resolveOpenClawMcpTransportAlias
//    来自 ../../../config/mcp-config-normalize.js → cross-wms 已移植（降级 stub）
//    用本地类型化包装函数保留原签名
import {
  isKnownCliMcpTypeAlias as isKnownCliMcpTypeAliasStub,
  resolveOpenClawMcpTransportAlias as resolveOpenClawMcpTransportAliasStub,
} from "../../../config/mcp-config-normalize.js";
import { isRecord, type JsonRecord } from "./legacy-config-record-shared.js";

export type LegacyConfigRule = {
  path: string[];
  message: string;
  match?: (value: unknown, root: JsonRecord) => boolean;
  requireSourceLiteral?: boolean;
};

export type LegacyConfigMigration = {
  id: string;
  describe: string;
  apply: (raw: JsonRecord, changes: string[]) => void;
};

export type LegacyConfigMigrationSpec = LegacyConfigMigration & {
  legacyRules?: LegacyConfigRule[];
};

/** Identity helper that preserves the LegacyConfigMigrationSpec shape for migration registries. */
export function defineLegacyConfigMigration(
  migration: LegacyConfigMigrationSpec,
): LegacyConfigMigrationSpec {
  return migration;
}

/** Typed wrapper for the cross-wms stub. Returns true when value is a known CLI MCP type alias. */
function isKnownCliMcpTypeAlias(value: unknown): boolean {
  return Boolean(isKnownCliMcpTypeAliasStub(value));
}

/** Typed wrapper for the cross-wms stub. Returns the resolved transport alias or undefined. */
function resolveOpenClawMcpTransportAlias(value: unknown): string | undefined {
  const result = resolveOpenClawMcpTransportAliasStub(value);
  return typeof result === "string" ? result : undefined;
}

const MCP_SERVER_TYPE_RULE: LegacyConfigRule = {
  path: ["mcp", "servers"],
  message:
    'mcp.servers entries use OpenClaw transport names; CLI-native type aliases are legacy here. Run "openclaw doctor --fix".',
  match: (value) =>
    isRecord(value) &&
    Object.values(value).some((server) => isRecord(server) && isKnownCliMcpTypeAlias(server.type)),
};

/** Legacy config migration specs for MCP server config compatibility. */
export const LEGACY_CONFIG_MIGRATIONS_RUNTIME_MCP: LegacyConfigMigrationSpec[] = [
  defineLegacyConfigMigration({
    id: "mcp.servers.type->transport",
    describe: "Move CLI-native MCP server type aliases to OpenClaw transport",
    legacyRules: [MCP_SERVER_TYPE_RULE],
    apply: (raw, changes) => {
      const mcp = isRecord(raw.mcp) ? raw.mcp : undefined;
      const servers = isRecord(mcp?.servers) ? mcp?.servers : undefined;
      if (!servers) {
        return;
      }

      for (const [serverName, rawServer] of Object.entries(servers)) {
        if (!isRecord(rawServer) || !isKnownCliMcpTypeAlias(rawServer.type)) {
          continue;
        }
        const rawType = typeof rawServer.type === "string" ? rawServer.type : "";
        const alias = resolveOpenClawMcpTransportAlias(rawServer.type);
        if (typeof rawServer.transport !== "string" && alias) {
          rawServer.transport = alias;
          changes.push(`Moved mcp.servers.${serverName}.type "${rawType}" → transport "${alias}".`);
        } else if (typeof rawServer.transport === "string") {
          changes.push(
            `Removed mcp.servers.${serverName}.type (transport "${rawServer.transport}" already set).`,
          );
        } else {
          changes.push(`Removed mcp.servers.${serverName}.type "${rawType}".`);
        }
        delete rawServer.type;
      }
    },
  }),
];
