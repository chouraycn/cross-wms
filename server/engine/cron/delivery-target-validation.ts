import { deliverySchema, deliveryPatchSchema } from "./delivery-field-schemas.js";
import type { ZodError } from "zod";

export interface DeliveryValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validateDelivery(delivery: any): DeliveryValidationResult {
  try {
    deliverySchema.parse(delivery);
    return { valid: true };
  } catch (err) {
    const issues = (err as ZodError).issues as Array<{ message: string }>;
    const errors = issues.map((e) => e.message);
    return { valid: false, errors };
  }
}

export function validateDeliveryPatch(patch: any): DeliveryValidationResult {
  try {
    deliveryPatchSchema.parse(patch);
    return { valid: true };
  } catch (err) {
    const issues = (err as ZodError).issues as Array<{ message: string }>;
    const errors = issues.map((e) => e.message);
    return { valid: false, errors };
  }
}