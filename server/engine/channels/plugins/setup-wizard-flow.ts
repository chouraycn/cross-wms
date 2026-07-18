import { logger } from "../../../logger.js";
import type { ChannelId, ChannelMeta, AppConfig } from "../../../channels/types.js";

export type WizardStepType = "info" | "input" | "select" | "toggle" | "credentials" | "webhook" | "success";

export interface WizardField {
  id: string;
  label: string;
  type: "text" | "password" | "email" | "number" | "select" | "toggle" | "textarea";
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
  helpText?: string;
}

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  type: WizardStepType;
  fields?: WizardField[];
  nextLabel?: string;
  prevLabel?: string;
  skipable?: boolean;
  validate?: (values: Record<string, unknown>) => string | null;
}

export interface WizardFlow {
  id: string;
  channelId: ChannelId;
  title: string;
  description?: string;
  steps: WizardStep[];
  currentStepIndex: number;
  values: Record<string, unknown>;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WizardFlowResult {
  success: boolean;
  values: Record<string, unknown>;
  errors?: string[];
}

const wizardFlows = new Map<string, WizardFlow>();
const wizardDefinitions = new Map<ChannelId, WizardStep[]>();

export function registerWizardFlow(channelId: ChannelId, steps: WizardStep[]): void {
  wizardDefinitions.set(channelId, steps);
  logger.debug(`[Plugins:SetupWizardFlow] Registered wizard for ${channelId} with ${steps.length} steps`);
}

export function getWizardSteps(channelId: ChannelId): WizardStep[] {
  return wizardDefinitions.get(channelId) ?? [];
}

export function startWizardFlow(params: {
  channelId: ChannelId;
  initialValues?: Record<string, unknown>;
}): WizardFlow {
  const steps = wizardDefinitions.get(params.channelId) ?? [];
  const now = Date.now();
  const flowId = `wizard-${params.channelId}-${now}`;

  const flow: WizardFlow = {
    id: flowId,
    channelId: params.channelId,
    title: `Setup ${params.channelId}`,
    steps,
    currentStepIndex: 0,
    values: params.initialValues ?? {},
    completed: false,
    createdAt: now,
    updatedAt: now,
  };

  wizardFlows.set(flowId, flow);
  logger.debug(`[Plugins:SetupWizardFlow] Started wizard flow ${flowId}`);
  return flow;
}

export function getWizardFlow(flowId: string): WizardFlow | undefined {
  return wizardFlows.get(flowId);
}

export function getCurrentStep(flowId: string): WizardStep | null {
  const flow = wizardFlows.get(flowId);
  if (!flow) return null;
  return flow.steps[flow.currentStepIndex] ?? null;
}

export function advanceWizardStep(
  flowId: string,
  values: Record<string, unknown>
): {
  ok: boolean;
  error?: string;
  completed?: boolean;
  nextStep?: WizardStep;
} {
  const flow = wizardFlows.get(flowId);
  if (!flow) {
    return { ok: false, error: "Flow not found" };
  }

  const currentStep = flow.steps[flow.currentStepIndex];
  if (!currentStep) {
    return { ok: false, error: "No current step" };
  }

  if (currentStep.validate) {
    const error = currentStep.validate(values);
    if (error) {
      return { ok: false, error };
    }
  }

  Object.assign(flow.values, values);
  flow.updatedAt = Date.now();

  if (flow.currentStepIndex >= flow.steps.length - 1) {
    flow.completed = true;
    flow.updatedAt = Date.now();
    return { ok: true, completed: true };
  }

  flow.currentStepIndex++;
  flow.updatedAt = Date.now();
  const nextStep = flow.steps[flow.currentStepIndex];

  return { ok: true, nextStep };
}

export function goToPreviousStep(flowId: string): WizardStep | null {
  const flow = wizardFlows.get(flowId);
  if (!flow || flow.currentStepIndex <= 0) return null;

  flow.currentStepIndex--;
  flow.updatedAt = Date.now();
  return flow.steps[flow.currentStepIndex];
}

export function completeWizardFlow(flowId: string): WizardFlowResult {
  const flow = wizardFlows.get(flowId);
  if (!flow) {
    return { success: false, values: {}, errors: ["Flow not found"] };
  }

  flow.completed = true;
  flow.updatedAt = Date.now();

  logger.debug(`[Plugins:SetupWizardFlow] Completed wizard flow ${flowId}`);
  return { success: true, values: flow.values };
}

export function cancelWizardFlow(flowId: string): boolean {
  const deleted = wizardFlows.delete(flowId);
  if (deleted) {
    logger.debug(`[Plugins:SetupWizardFlow] Cancelled wizard flow ${flowId}`);
  }
  return deleted;
}

export function isWizardComplete(flowId: string): boolean {
  return wizardFlows.get(flowId)?.completed ?? false;
}

export function getWizardProgress(flowId: string): {
  current: number;
  total: number;
  percentage: number;
} {
  const flow = wizardFlows.get(flowId);
  if (!flow) return { current: 0, total: 0, percentage: 0 };

  const current = flow.currentStepIndex + 1;
  const total = flow.steps.length;
  return {
    current,
    total,
    percentage: total > 0 ? Math.round((current / total) * 100) : 0,
  };
}

export function clearWizardFlows(): void {
  wizardFlows.clear();
}
