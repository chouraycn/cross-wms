/**
 * cron built-in tool.
 *
 * Manages scheduled jobs, wake/run actions, delivery context, and reminder-style payload normalization.
 *
 * Simplified for cross-wms: preserves schema definitions and type exports;
 * actual execution requires gateway/cron service integration.
 */
import type { TSchema } from "typebox";
import { Type } from "typebox";
import type { AnyAgentTool } from "./common.js";
import {
  canonicalizeCronToolObject,
  hasCronCreateSignal,
  isEmptyRecoveredCronPatch,
  recoverCronObjectFromFlatParams,
} from "./cron-tool-canonicalize.js";

export type CronCreatorToolAllowlistEntry =
  | string
  | {
      name: string;
      pluginId?: string;
    };

const CRON_ACTIONS = [
  "status",
  "list",
  "get",
  "add",
  "update",
  "remove",
  "run",
  "runs",
  "wake",
] as const;

const CRON_SCHEDULE_KINDS = ["at", "every", "cron"] as const;
const CRON_WAKE_MODES = ["now", "next-heartbeat"] as const;
const CRON_PAYLOAD_KINDS = ["systemEvent", "agentTurn"] as const;
const CRON_DELIVERY_MODES = ["none", "announce", "webhook"] as const;
const CRON_RUN_MODES = ["due", "force"] as const;

const REMINDER_CONTEXT_MESSAGES_MAX = 10;
const REMINDER_CONTEXT_PER_MESSAGE_MAX = 220;
const REMINDER_CONTEXT_TOTAL_MAX = 700;
const REMINDER_CONTEXT_MARKER = "\n\nRecent context:\n";

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

function isMissingOrEmptyObject(value: unknown): boolean {
  return !value || (isRecord(value) && Object.keys(value).length === 0);
}

function optionalStringEnum(values: readonly string[], opts?: { description?: string }) {
  return Type.Optional(Type.Union(values.map((v) => Type.Literal(v)), opts));
}

function stringEnum(values: readonly string[], opts?: { description?: string }) {
  return Type.Union(values.map((v) => Type.Literal(v)), opts);
}

function optionalFiniteNumberSchema(opts?: { minimum?: number }) {
  return Type.Optional(Type.Number({ ...opts }));
}

function optionalNonNegativeIntegerSchema(opts?: { description?: string }) {
  return Type.Optional(Type.Integer({ minimum: 0, ...opts }));
}

function optionalPositiveIntegerSchema(opts?: { description?: string }) {
  return Type.Optional(Type.Integer({ minimum: 1, ...opts }));
}

function nullableStringSchema(description: string) {
  return Type.Optional(Type.Union([Type.String(), Type.Null()], { description }));
}

function nullableStringArraySchema(description: string) {
  return Type.Optional(Type.Union([Type.Array(Type.String()), Type.Null()], { description }));
}

function deliveryStringSchema(params: { description: string; nullableClears: boolean }) {
  return params.nullableClears
    ? nullableStringSchema(`${params.description}, or null to clear`)
    : Type.Optional(Type.String({ description: params.description }));
}

function deliveryThreadIdSchema(params: { nullableClears: boolean }) {
  const variants = params.nullableClears
    ? [Type.String(), Type.Number(), Type.Null()]
    : [Type.String(), Type.Number()];
  return Type.Optional(Type.Union(variants, { description: "Thread/topic id" }));
}

function failureDestinationModeSchema(params: { nullableClears: boolean }) {
  const variants = params.nullableClears
    ? [Type.Literal("announce"), Type.Literal("webhook"), Type.Null()]
    : [Type.Literal("announce"), Type.Literal("webhook")];
  return Type.Optional(Type.Union(variants));
}

function cronPayloadObjectSchema(params: { model: TSchema; toolsAllow: TSchema }) {
  return Type.Object(
    {
      kind: optionalStringEnum(CRON_PAYLOAD_KINDS, { description: "Payload kind" }),
      text: Type.Optional(Type.String({ description: "systemEvent text" })),
      message: Type.Optional(Type.String({ description: "agentTurn prompt" })),
      model: params.model,
      thinking: Type.Optional(Type.String({ description: "Thinking override" })),
      timeoutSeconds: optionalFiniteNumberSchema({ minimum: 0 }),
      lightContext: Type.Optional(Type.Boolean()),
      allowUnsafeExternalContent: Type.Optional(Type.Boolean()),
      fallbacks: Type.Optional(Type.Array(Type.String(), { description: "Fallback models" })),
      toolsAllow: params.toolsAllow,
    },
    { additionalProperties: true },
  );
}

function createCronScheduleSchema(): TSchema {
  return Type.Optional(
    Type.Object(
      {
        kind: optionalStringEnum(CRON_SCHEDULE_KINDS, { description: "Schedule kind" }),
        at: Type.Optional(Type.String({ description: "ISO-8601 time (kind=at)" })),
        everyMs: optionalPositiveIntegerSchema({ description: "Interval ms (kind=every)" }),
        anchorMs: optionalNonNegativeIntegerSchema({
          description: "Start anchor ms (kind=every)",
        }),
        expr: Type.Optional(
          Type.String({
            description:
              'Cron expr in tz wall-clock time; do not convert to UTC. Omitted tz => Gateway host local timezone. Example 6pm Shanghai daily: expr "0 18 * * *", tz "Asia/Shanghai".',
          }),
        ),
        tz: Type.Optional(
          Type.String({
            description:
              'IANA timezone for cron wall-clock fields, e.g. "Asia/Shanghai"; omitted => Gateway host local timezone.',
          }),
        ),
        staggerMs: optionalNonNegativeIntegerSchema({ description: "Jitter ms (kind=cron)" }),
      },
      { additionalProperties: true },
    ),
  );
}

function createCronPayloadSchema(): TSchema {
  return Type.Optional(
    cronPayloadObjectSchema({
      model: Type.Optional(Type.String({ description: "Model override" })),
      toolsAllow: Type.Optional(Type.Array(Type.String(), { description: "Allowed tools" })),
    }),
  );
}

function cronDeliverySchema(params: { nullableClears: boolean }) {
  const failureDestinationObject = Type.Object(
    {
      channel: deliveryStringSchema({
        description: "Failure delivery channel",
        nullableClears: params.nullableClears,
      }),
      to: deliveryStringSchema({
        description: "Failure delivery target",
        nullableClears: params.nullableClears,
      }),
      accountId: deliveryStringSchema({
        description: "Failure delivery account",
        nullableClears: params.nullableClears,
      }),
      mode: failureDestinationModeSchema({ nullableClears: params.nullableClears }),
    },
    { additionalProperties: true },
  );

  return Type.Optional(
    Type.Object(
      {
        mode: optionalStringEnum(CRON_DELIVERY_MODES, { description: "Delivery mode" }),
        channel: deliveryStringSchema({
          description: "Delivery channel",
          nullableClears: params.nullableClears,
        }),
        to: deliveryStringSchema({
          description: "Delivery target",
          nullableClears: params.nullableClears,
        }),
        threadId: deliveryThreadIdSchema({ nullableClears: params.nullableClears }),
        bestEffort: Type.Optional(Type.Boolean()),
        accountId: deliveryStringSchema({
          description: "Delivery account",
          nullableClears: params.nullableClears,
        }),
        failureDestination: params.nullableClears
          ? Type.Optional(
              Type.Union([failureDestinationObject, Type.Null()], {
                description: "Failure destination, or null to clear",
              }),
            )
          : Type.Optional(failureDestinationObject),
      },
      { additionalProperties: true },
    ),
  );
}

function createCronDeliverySchema(): TSchema {
  return cronDeliverySchema({ nullableClears: false });
}

function createCronDeliveryPatchSchema(): TSchema {
  return cronDeliverySchema({ nullableClears: true });
}

function createCronFailureAlertSchema(): TSchema {
  return Type.Optional(
    Type.Unsafe<Record<string, unknown> | false>({
      type: "object",
      properties: {
        after: optionalPositiveIntegerSchema({ description: "Failures before alert" }),
        channel: Type.Optional(Type.String({ description: "Alert channel" })),
        to: Type.Optional(Type.String({ description: "Alert target" })),
        cooldownMs: optionalNonNegativeIntegerSchema({ description: "Alert cooldown ms" }),
        includeSkipped: Type.Optional(
          Type.Boolean({ description: "Skipped runs count toward alert" }),
        ),
        mode: optionalStringEnum(["announce", "webhook"] as const),
        accountId: Type.Optional(Type.String()),
      },
      additionalProperties: true,
      description: "Failure alert object; false disables alerts",
    }),
  );
}

function createCronJobObjectSchema(): TSchema {
  return Type.Optional(
    Type.Object(
      {
        name: Type.Optional(Type.String({ description: "Job name" })),
        schedule: createCronScheduleSchema(),
        sessionTarget: Type.Optional(
          Type.String({
            description: "main | isolated | current | session:<id>",
          }),
        ),
        wakeMode: optionalStringEnum(CRON_WAKE_MODES, { description: "Wake timing" }),
        payload: createCronPayloadSchema(),
        delivery: createCronDeliverySchema(),
        agentId: nullableStringSchema("Agent id, or null to keep it unset"),
        description: Type.Optional(Type.String({ description: "Human description" })),
        enabled: Type.Optional(Type.Boolean()),
        deleteAfterRun: Type.Optional(Type.Boolean({ description: "Delete after first run" })),
        sessionKey: nullableStringSchema("Explicit session key, or null to clear it"),
        failureAlert: createCronFailureAlertSchema(),
      },
      { additionalProperties: true },
    ),
  );
}

function createCronPatchObjectSchema(): TSchema {
  return Type.Optional(
    Type.Object(
      {
        name: Type.Optional(Type.String({ description: "Job name" })),
        schedule: createCronScheduleSchema(),
        sessionTarget: Type.Optional(Type.String({ description: "Session target" })),
        wakeMode: optionalStringEnum(CRON_WAKE_MODES),
        payload: Type.Optional(
          cronPayloadObjectSchema({
            model: nullableStringSchema("Model override, or null to clear"),
            toolsAllow: nullableStringArraySchema("Allowed tool ids, or null to clear"),
          }),
        ),
        delivery: createCronDeliveryPatchSchema(),
        description: Type.Optional(Type.String()),
        enabled: Type.Optional(Type.Boolean()),
        deleteAfterRun: Type.Optional(Type.Boolean()),
        agentId: nullableStringSchema("Agent id, or null to clear it"),
        sessionKey: nullableStringSchema("Explicit session key, or null to clear it"),
        failureAlert: createCronFailureAlertSchema(),
      },
      { additionalProperties: true },
    ),
  );
}

export function createCronToolSchema(): TSchema {
  return Type.Object(
    {
      action: stringEnum(CRON_ACTIONS),
      includeDisabled: Type.Optional(Type.Boolean()),
      job: createCronJobObjectSchema(),
      jobId: Type.Optional(Type.String()),
      id: Type.Optional(Type.String()),
      patch: createCronPatchObjectSchema(),
      text: Type.Optional(Type.String()),
      mode: optionalStringEnum(CRON_WAKE_MODES),
      runMode: optionalStringEnum(CRON_RUN_MODES, {
        description:
          'Run mode for action="run": omitted defaults to "due"; use "force" to trigger now.',
      }),
      contextMessages: Type.Optional(
        Type.Integer({ minimum: 0, maximum: REMINDER_CONTEXT_MESSAGES_MAX }),
      ),
      agentId: Type.Optional(
        Type.String({
          description:
            'List filter for `action: "list"`; wake target override for `action: "wake"` (defaults to the calling agent when omitted on wake)',
        }),
      ),
      sessionKey: Type.Optional(
        Type.String({
          description:
            'Wake target override for `action: "wake"`: route the event to the named session rather than the calling agent\'s current session. Defaults to the resolved calling-session key when omitted.',
        }),
      ),
    },
    { additionalProperties: true },
  );
}

type CronToolOptions = {
  agentSessionKey?: string;
  currentDeliveryContext?: unknown;
  creatorToolAllowlist?: CronCreatorToolAllowlistEntry[];
  selfRemoveOnlyJobId?: string;
};

type CronToolDeps = {
  callGatewayTool?: (
    action: string,
    opts: unknown,
    params: unknown,
    extra?: unknown,
  ) => Promise<unknown>;
};

export function replaceWithEffectiveCronCreatorToolAllowlist<T extends { name: string }>(
  target: CronCreatorToolAllowlistEntry[],
  tools: readonly T[],
  toolMeta?: (tool: T) => { pluginId?: string } | undefined,
): void {
  target.length = 0;
  const seen = new Set<string>();
  for (const tool of tools) {
    const name = tool.name.trim().toLowerCase();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    const meta = toolMeta?.(tool);
    const pluginId =
      typeof meta?.pluginId === "string" ? meta.pluginId.trim().toLowerCase() : undefined;
    target.push(pluginId ? { name, pluginId } : { name });
  }
}

export function createCronTool(_opts?: CronToolOptions, _deps?: CronToolDeps): AnyAgentTool {
  const schema = createCronToolSchema();
  return {
    label: "Cron",
    name: "cron",
    description: `Manage Gateway cron jobs and wake events: reminders, check-back-later, delayed follow-ups, recurring work.

ACTIONS:
- status: scheduler status
- list: compact job summaries; includeDisabled true includes disabled; use get for full job details; agentId filter auto-filled from session
- get: one job; needs jobId
- add: create job; needs job object
- update: patch job; needs jobId + patch
- remove: delete job; needs jobId
- run: run only if due by default; needs jobId; pass runMode="force" to trigger now
- runs: run history; needs jobId
- wake: send wake event; needs text, optional mode; defaults the target to the calling session/agent.

SCHEDULE TYPES (schedule.kind):
- "at": one-shot absolute time
  { "kind": "at", "at": "<ISO-8601 timestamp>" }
- "every": recurring interval
  { "kind": "every", "everyMs": <ms>, "anchorMs": <optional-ms> }
- "cron": expr in supplied timezone
  { "kind": "cron", "expr": "<cron-expression>", "tz": "<optional-IANA-timezone>" }

PAYLOAD TYPES (payload.kind):
- "systemEvent": inject text as system event
  { "kind": "systemEvent", "text": "<message>" }
- "agentTurn": run agent with prompt
  { "kind": "agentTurn", "message": "<prompt>", "model": "<optional>" }`,
    parameters: schema as unknown as Record<string, {
      name: string;
      type: "string" | "number" | "boolean" | "object" | "any" | "array";
      description: string;
      required: boolean;
      default?: unknown;
      enum?: string[] | undefined;
      items?: { type: string } | undefined;
      properties?: Record<string, unknown> | undefined;
    }>,
    async execute(_toolCallId: string, args: unknown) {
      const params = args as Record<string, unknown>;
      const action = typeof params.action === "string" ? params.action : "";

      if (action === "add" && isMissingOrEmptyObject(params.job)) {
        const synthetic = recoverCronObjectFromFlatParams(params);
        if (synthetic.found && hasCronCreateSignal(synthetic.value)) {
          params.job = synthetic.value;
        }
      }

      if (action === "update") {
        if (isMissingOrEmptyObject(params.patch)) {
          const synthetic = recoverCronObjectFromFlatParams(params);
          if (synthetic.found) {
            params.patch = synthetic.value;
          }
        }
        if (params.patch && isRecord(params.patch)) {
          const canonicalPatch = canonicalizeCronToolObject(params.patch);
          if (isEmptyRecoveredCronPatch(canonicalPatch)) {
            throw new Error("patch required");
          }
        }
      }

      throw new Error(
        `Cron tool action "${action}" not implemented in cross-wms. Requires cron service integration.`,
      );
    },
  } as unknown as AnyAgentTool;
}
