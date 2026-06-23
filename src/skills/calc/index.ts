import type { SkillContext, SkillResult } from '../../../server/types/skill-runtime.js';

export async function execute(
  params: Record<string, unknown>,
  _ctx: SkillContext,
): Promise<SkillResult> {
  const a = Number(params.a);
  const b = Number(params.b);
  const op = String(params.op);
  let result: number;

  switch (op) {
    case '+': result = a + b; break;
    case '-': result = a - b; break;
    case '*': result = a * b; break;
    case '/': result = b !== 0 ? a / b : NaN; break;
    default:
      return { success: false, error: `不支持的操作符: ${op}` };
  }

  return { success: true, data: { result } };
}
