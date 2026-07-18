import { z } from "zod";

export const deliveryModeSchema = z.enum(["none", "announce", "webhook"]);

export const deliveryChannelSchema = z.string().trim().optional();

export const deliveryToSchema = z.string().trim().optional();

export const deliveryAccountIdSchema = z.string().trim().optional();

export const deliveryThreadIdSchema = z.union([z.string(), z.number()]).optional();

export const deliveryBestEffortSchema = z.boolean().optional();

export const deliverySchema = z.object({
  mode: deliveryModeSchema,
  channel: deliveryChannelSchema,
  to: deliveryToSchema,
  accountId: deliveryAccountIdSchema,
  threadId: deliveryThreadIdSchema,
  bestEffort: deliveryBestEffortSchema,
});

export const failureDestinationSchema = z.object({
  channel: deliveryChannelSchema,
  to: deliveryToSchema,
  accountId: deliveryAccountIdSchema,
  mode: z.enum(["announce", "webhook"]).optional(),
});

export const completionDestinationSchema = z.object({
  mode: z.literal("webhook"),
  to: deliveryToSchema,
});

export const deliveryPatchSchema = z.object({
  mode: deliveryModeSchema.optional(),
  channel: z.union([deliveryChannelSchema, z.literal(null)]).optional(),
  to: z.union([deliveryToSchema, z.literal(null)]).optional(),
  threadId: z.union([deliveryThreadIdSchema, z.literal(null)]).optional(),
  accountId: z.union([deliveryAccountIdSchema, z.literal(null)]).optional(),
  bestEffort: deliveryBestEffortSchema,
  completionDestination: z.union([completionDestinationSchema, z.literal(null)]).optional(),
  failureDestination: z.union([failureDestinationSchema, z.literal(null)]).optional(),
});