// Node screen recording command: invokes screen.record and writes returned media locally.
import type { Command } from "commander";
import { defaultRuntime } from "./runtime.js";
import { shortenHomePath } from "../utils.js";
import { parseDurationMs } from "./parse-duration.js";
import { runNodesCommand } from "./nodes-cli-utils.js";
import {
  buildNodeInvokeParams,
  callGatewayCli,
  nodesCallOpts,
  parseOptionalNodeFiniteNumber,
  parseOptionalNodeNonNegativeInteger,
  parseOptionalNodePositiveInteger,
  resolveNodeId,
} from "./rpc.js";
import type { NodesRpcOpts } from "./types.js";

export function registerNodesScreenCommands(nodes: Command) {
  const screen = nodes
    .command("screen")
    .description("Capture screen recordings from a paired node");

  nodesCallOpts(
    screen
      .command("record")
      .description("Capture a short screen recording from a node (prints the saved path)")
      .requiredOption("--node <idOrNameOrIp>", "Node id, name, or IP")
      .option("--screen <index>", "Screen index (0 = primary)", "0")
      .option("--duration <ms|10s>", "Clip duration (ms or 10s)", "10000")
      .option("--fps <fps>", "Frames per second", "10")
      .option("--no-audio", "Disable microphone audio capture")
      .option("--out <path>", "Output path")
      .option("--invoke-timeout <ms>", "Node invoke timeout in ms (default 120000)", "120000")
      .action(async (opts: NodesRpcOpts & { out?: string }) => {
        await runNodesCommand("screen record", async () => {
          const nodeId = await resolveNodeId(opts, opts.node ?? "");
          const durationMs = parseDurationMs(opts.duration ?? "");
          const screenIndex = parseOptionalNodeNonNegativeInteger(opts.screen ?? "0", "--screen");
          const fps = parseOptionalNodeFiniteNumber(opts.fps ?? "10", "--fps", {
            minExclusive: 0,
          });
          const timeoutMs = parseOptionalNodePositiveInteger(
            opts.invokeTimeout,
            "--invoke-timeout",
          );

          const invokeParams = buildNodeInvokeParams({
            nodeId,
            command: "screen.record",
            params: {
              durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
              screenIndex: Number.isFinite(screenIndex) ? screenIndex : undefined,
              fps: Number.isFinite(fps) ? fps : undefined,
              format: "mp4",
              includeAudio: opts.audio !== false,
            },
            timeoutMs,
          });

          const raw = await callGatewayCli("node.invoke", opts, invokeParams);
          const res = typeof raw === "object" && raw !== null ? (raw as { payload?: any }) : {};
          const filePath = opts.out ?? `/tmp/screen-record-${Date.now()}.mp4`;

          if (opts.json) {
            defaultRuntime.writeJson({
              file: {
                path: filePath,
                durationMs,
                fps,
                screenIndex,
                hasAudio: opts.audio !== false,
              },
            });
            return;
          }
          defaultRuntime.log(shortenHomePath(filePath));
        });
      }),
    { timeoutMs: 180_000 },
  );
}
