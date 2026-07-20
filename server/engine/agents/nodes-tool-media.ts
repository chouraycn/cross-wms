/**
 * Ported from openclaw/src/agents/tools/nodes-tool-media.ts
 *
 * Nodes media action executor.
 * Cross-wms degradation: exports constants and a no-op executor without
 * camera/screen gateway dependencies.
 */

export const MEDIA_INVOKE_ACTIONS = {
  "camera.snap": "camera_snap",
  "camera.clip": "camera_clip",
  "photos.latest": "photos_latest",
  "screen.record": "screen_record",
  "screen.snapshot": "screen_snapshot",
  "file.fetch": "file_fetch",
  "dir.list": "dir_list",
  "dir.fetch": "dir_fetch",
  "file.write": "file_write",
} as const;

export const POLICY_REDIRECT_INVOKE_COMMANDS: ReadonlySet<string> = new Set([
  "file.fetch",
  "dir.list",
  "dir.fetch",
  "file.write",
]);

/** Executes a node media action. Cross-wms degradation: returns error result. */
export async function executeNodeMediaAction(input: {
  action: string;
  params: Record<string, unknown>;
  gatewayOpts?: Record<string, unknown>;
  modelHasVision?: boolean;
  imageSanitization?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  return {
    content: [{ type: "text", text: `Node media action "${input.action}" not available in cross-wms` }],
    details: {},
  };
}
