// Defines cron-related Zod schema fragments for config parsing.
// Extracted from openclaw zod-schema.ts where it is defined inline.
import { normalizeStringifiedOptionalString } from "../utils/string-coerce.js";
import { z } from "zod";
import { parseByteSize } from "../engine/cli/parse-bytes.js";
import { parseDurationMs } from "../cli/parse-duration.js";
import { SecretInputSchema } from "./zod-schema.core.js";
import { sensitive } from "./zod-schema.sensitive.js";

const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Expected http:// or https:// URL");

export const CronSchema = z
  .object({
    enabled: z.boolean().optional(),
    store: z.string().optional(),
    maxConcurrentRuns: z.number().int().positive().optional(),
    retry: z
      .object({
        maxAttempts: z.number().int().min(0).max(10).optional(),
        backoffMs: z.array(z.number().int().nonnegative()).min(1).max(10).optional(),
        retryOn: z
          .array(z.enum(["rate_limit", "overloaded", "network", "timeout", "server_error"]))
          .min(1)
          .optional(),
      })
      .strict()
      .optional(),
    webhook: HttpUrlSchema.optional(),
    webhookToken: SecretInputSchema.optional().register(sensitive),
    sessionRetention: z.union([z.string(), z.literal(false)]).optional(),
    runLog: z
      .object({
        maxBytes: z.union([z.string(), z.number()]).optional(),
        keepLines: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    failureAlert: z
      .object({
        enabled: z.boolean().optional(),
        after: z.number().int().min(1).optional(),
        cooldownMs: z.number().int().min(0).optional(),
        includeSkipped: z.boolean().optional(),
        mode: z.enum(["announce", "webhook"]).optional(),
        accountId: z.string().optional(),
      })
      .strict()
      .optional(),
    failureDestination: z
      .object({
        channel: z.string().optional(),
        to: z.string().optional(),
        accountId: z.string().optional(),
        mode: z.enum(["announce", "webhook"]).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.sessionRetention !== undefined && val.sessionRetention !== false) {
      try {
        parseDurationMs(normalizeStringifiedOptionalString(val.sessionRetention) ?? "", {
          defaultUnit: "h",
        });
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sessionRetention"],
          message: "invalid duration (use ms, s, m, h, d)",
        });
      }
    }
    if (val.runLog?.maxBytes !== undefined) {
      try {
        parseByteSize(normalizeStringifiedOptionalString(val.runLog.maxBytes) ?? "", {
          defaultUnit: "b",
        });
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["runLog", "maxBytes"],
          message: "invalid size (use b, kb, mb, gb, tb)",
        });
      }
    }
  })
  .optional();
