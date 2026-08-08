// @ts-nocheck
/** CLI entrypoint for channel message actions. */
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "@openclaw/normalization-core/string-coerce";
import {
  GATEWAY_CLIENT_MODES,
  GATEWAY_CLIENT_NAMES,
} from "@openclaw-src/packages/gateway-protocol/src/client-info.js";
import { resolveDefaultAgentId } from "@openclaw-src/agents/agent-scope.js";
import { CHANNEL_MESSAGE_ACTION_NAMES } from "@openclaw-src/channels/plugins/message-action-names.js";
import type { ChannelMessageActionName } from "@openclaw-src/channels/plugins/types.public.js";
import { resolveCommandConfigWithSecrets } from "@openclaw-src/cli/command-config-resolution.js";
import { formatCliCommand } from "@openclaw-src/cli/command-format.js";
import { getScopedChannelsCommandSecretTargets } from "@openclaw-src/cli/command-secret-targets.js";
import { resolveMessageSecretScope } from "@openclaw-src/cli/message-secret-scope.js";
import { createOutboundSendDeps, type CliDeps } from "@openclaw-src/cli/outbound-send-deps.js";
import { withProgress } from "@openclaw-src/cli/progress.js";
import { getRuntimeConfig } from "@openclaw-src/config/config.js";
import type { OutboundSendDeps } from "@openclaw-src/infra/outbound/deliver.js";
import { runMessageAction } from "@openclaw-src/infra/outbound/message-action-runner.js";
import { type RuntimeEnv, writeRuntimeJson } from "@openclaw-src/runtime.js";

function extractMessageId(payload: any): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, any>;
  const direct = normalizeOptionalString(record.messageId);
  if (direct) {
    return direct;
  }
  const result = record.result;
  if (result && typeof result === "object") {
    const nested = normalizeOptionalString((result as Record<string, any>).messageId);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function buildMessageCliJson(result: Awaited<ReturnType<typeof runMessageAction>>) {
  const messageId = extractMessageId(result.payload);
  return {
    action: result.action,
    channel: result.channel,
    dryRun: result.dryRun,
    handledBy: result.handledBy,
    ...(messageId ? { messageId } : {}),
    payload: result.payload,
  };
}

/** Resolves config/secrets, runs a channel message action, then renders JSON or text. */
export async function messageCommand(
  opts: Record<string, any>,
  deps: CliDeps,
  runtime: RuntimeEnv,
) {
  const loadedRaw = getRuntimeConfig();
  const scope = resolveMessageSecretScope({
    channel: opts.channel,
    target: opts.target,
    targets: opts.targets,
    accountId: opts.accountId,
  });
  const scopedTargets = getScopedChannelsCommandSecretTargets({
    config: loadedRaw,
    channel: scope.channel,
    accountId: scope.accountId,
  });
  const { effectiveConfig: cfg } = await resolveCommandConfigWithSecrets({
    config: loadedRaw,
    commandName: "message",
    targetIds: scopedTargets.targetIds,
    ...(scopedTargets.allowedPaths ? { allowedPaths: scopedTargets.allowedPaths } : {}),
    runtime,
    autoEnable: true,
  });
  const rawAction = normalizeOptionalString(opts.action) ?? "";
  const actionInput = rawAction || "send";
  const normalizedActionInput = normalizeLowercaseStringOrEmpty(actionInput);
  const actionMatch = (CHANNEL_MESSAGE_ACTION_NAMES as readonly string[]).find(
    (name) => normalizeLowercaseStringOrEmpty(name) === normalizedActionInput,
  );
  if (!actionMatch) {
    throw new Error(
      `Unknown message action "${actionInput}". Use one of ${CHANNEL_MESSAGE_ACTION_NAMES.join(
        ", ",
      )}. Example: ${formatCliCommand("openclaw message send --channel <channel> --target <id> --text <message>")}.`,
    );
  }
  const action = actionMatch as ChannelMessageActionName;

  const outboundDeps: OutboundSendDeps = createOutboundSendDeps(deps);

  // Keep the gateway client identity explicit so channel plugins can distinguish
  // CLI-originated owner actions from background gateway work.
  const run = async () =>
    await runMessageAction({
      cfg,
      action,
      params: opts,
      deps: outboundDeps,
      agentId: resolveDefaultAgentId(cfg),
      senderIsOwner: opts.senderIsOwner !== false,
      gateway: {
        clientName: GATEWAY_CLIENT_NAMES.CLI,
        mode: GATEWAY_CLIENT_MODES.CLI,
      },
    });

  const json = opts.json === true;
  const dryRun = opts.dryRun === true;
  const needsSpinner = !json && !dryRun && (action === "send" || action === "poll");

  const result = needsSpinner
    ? await withProgress(
        {
          label: action === "poll" ? "Sending poll..." : "Sending...",
          indeterminate: true,
          enabled: true,
        },
        run,
      )
    : await run();

  if (json) {
    writeRuntimeJson(runtime, buildMessageCliJson(result));
    return;
  }

  const { formatMessageCliText } = await import("./message-format.js");
  for (const line of formatMessageCliText(result)) {
    runtime.log(line);
  }
}
