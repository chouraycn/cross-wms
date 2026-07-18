import type { CrestodianAssistantPlan, CrestodianOverview, CrestodianOperationType } from './types.js';

export const CRESTODIAN_ASSISTANT_MAX_TOKENS = 500;
export const CRESTODIAN_ASSISTANT_TIMEOUT_MS = 15000;

export const CRESTODIAN_ASSISTANT_SYSTEM_PROMPT = `You are Crestodian, a system guardian and diagnostic assistant.
Your job is to analyze system health and recommend appropriate operations.

Available operations:
- inspect: Check system status and health
- repair: Fix identified issues
- restart: Restart services
- reset: Reset to default state
- backup: Create data backup
- restore: Restore from backup
- cleanup: Remove stale data
- migrate: Migrate data
- validate: Validate configuration
- diagnose: Run diagnostic tests

Always respond with a JSON object containing:
{
  "operation": "<operation-type>",
  "target": "<optional-target>",
  "reason": "<reason-for-operation>",
  "confidence": 0.0-1.0,
  "steps": ["step1", "step2"],
  "risks": ["risk1", "risk2"]
}`;

export function buildCrestodianAssistantUserPrompt(params: {
  input: string;
  overview: CrestodianOverview;
}): string {
  const { input, overview } = params;
  return `System Status:
- Overall Status: ${overview.status}
- Uptime: ${Math.round(overview.uptimeMs / 1000)}s
- Healthy Probes: ${overview.summary.healthy}/${overview.summary.total}
- Degraded Probes: ${overview.summary.degraded}/${overview.summary.total}
- Critical Probes: ${overview.summary.critical}/${overview.summary.total}
- Active Rescues: ${overview.activeRescues}

User Request: ${input}

What operation should be performed? Respond with JSON only.`;
}

export function parseCrestodianAssistantPlanText(text: string): CrestodianAssistantPlan | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.operation || typeof parsed.operation !== 'string') {
      return null;
    }
    return {
      operation: parsed.operation as CrestodianOperationType,
      target: parsed.target,
      reason: parsed.reason ?? '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    };
  } catch {
    return null;
  }
}
