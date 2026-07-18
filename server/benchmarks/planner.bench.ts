/**
 * Planner 性能基准测试
 *
 * 测试计划拓扑排序、计划推进等操作的性能。
 */
import { BenchmarkRunner } from '@cdf-know/benchmark';

const runner = new BenchmarkRunner({ defaultIterations: 10, defaultWarmup: 3 });

interface PlanStep {
  step: number;
  description: string;
  dependsOn: number[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
}

interface ExecutionPlan {
  id: string;
  intent: string;
  steps: PlanStep[];
  isDynamic: boolean;
  createdAt: number;
}

/**
 * 拓扑排序实现（与 planner.ts 中一致）
 */
function topologicalSort(steps: PlanStep[]): PlanStep[] {
  const stepMap = new Map<number, PlanStep>();
  for (const step of steps) {
    stepMap.set(step.step, step);
  }

  const inDegree = new Map<number, number>();
  const adj = new Map<number, number[]>();
  for (const step of steps) {
    inDegree.set(step.step, 0);
    adj.set(step.step, []);
  }

  for (const step of steps) {
    for (const dep of step.dependsOn) {
      if (stepMap.has(dep)) {
        adj.get(dep)!.push(step.step);
        inDegree.set(step.step, (inDegree.get(step.step) ?? 0) + 1);
      }
    }
  }

  const queue: number[] = [];
  for (const [stepNum, degree] of inDegree) {
    if (degree === 0) queue.push(stepNum);
  }

  const sorted: PlanStep[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const step = stepMap.get(curr)!;
    sorted.push(step);

    for (const neighbor of adj.get(curr) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== steps.length) {
    throw new Error('存在循环依赖，无法拓扑排序');
  }

  return sorted;
}

/**
 * advancePlan 实现（简化版，与 planner.ts 中一致）
 */
function advancePlan(plan: ExecutionPlan, completedStepIndex: number): ExecutionPlan {
  const completedStep = plan.steps[completedStepIndex];
  if (!completedStep) {
    return plan;
  }

  completedStep.status = 'completed';

  for (const step of plan.steps) {
    if (step.status !== 'pending') continue;
    step.dependsOn.every((dep) => {
      const depStep = plan.steps.find((s) => s.step === dep);
      return depStep?.status === 'completed';
    });
  }

  return plan;
}

/**
 * 生成指定步数的随机依赖计划
 */
function generatePlan(stepCount: number, dependencyDensity: number = 0.1): ExecutionPlan {
  const steps: PlanStep[] = [];

  for (let i = 1; i <= stepCount; i++) {
    const dependsOn: number[] = [];
    for (let j = 1; j < i; j++) {
      if (Math.random() < dependencyDensity) {
        dependsOn.push(j);
      }
    }
    if (i > 1 && dependsOn.length === 0) {
      dependsOn.push(i - 1);
    }
    steps.push({
      step: i,
      description: `步骤 ${i}`,
      dependsOn,
      status: 'pending',
    });
  }

  return {
    id: `plan-${stepCount}`,
    intent: `测试计划 - ${stepCount} 步`,
    steps,
    isDynamic: false,
    createdAt: Date.now(),
  };
}

/**
 * 100 步计划拓扑排序
 */
async function topoSort100Steps() {
  const plan = generatePlan(100, 0.05);

  const result = await runner.run(
    '100 步计划拓扑排序',
    () => {
      topologicalSort(plan.steps);
    },
    { iterations: 100, warmup: 10 },
  );

  return result;
}

/**
 * 1000 步计划拓扑排序
 */
async function topoSort1000Steps() {
  const plan = generatePlan(1000, 0.02);

  const result = await runner.run(
    '1000 步计划拓扑排序',
    () => {
      topologicalSort(plan.steps);
    },
    { iterations: 20, warmup: 5 },
  );

  return result;
}

/**
 * 10 层依赖链 advancePlan
 */
async function advancePlan10Layers() {
  const steps: PlanStep[] = [];
  for (let i = 1; i <= 100; i++) {
    const dependsOn: number[] = [];
    if (i > 1) {
      dependsOn.push(i - 1);
    }
    steps.push({
      step: i,
      description: `步骤 ${i}`,
      dependsOn,
      status: 'pending',
    });
  }

  const result = await runner.run(
    '100 步链式计划 advancePlan',
    () => {
      const plan: ExecutionPlan = {
        id: 'test',
        intent: '测试',
        steps: steps.map((s) => ({ ...s })),
        isDynamic: false,
        createdAt: Date.now(),
      };
      for (let i = 0; i < 50; i++) {
        advancePlan(plan, i);
      }
    },
    { iterations: 50, warmup: 10 },
  );

  return result;
}

export async function runPlannerBenchmarks() {
  console.log('\n=== Planner 性能基准测试 ===\n');

  const results = [];

  results.push(await topoSort100Steps());
  results.push(await topoSort1000Steps());
  results.push(await advancePlan10Layers());

  for (const r of results) {
    const formatted = runner.formatResult(r);
    console.log(`${formatted.name}:`);
    console.log(`  每秒操作: ${formatted.opsPerSecond.toFixed(2)} ops/s`);
    console.log(`  平均耗时: ${formatted.avgMs.toFixed(4)} ms`);
    console.log('');
  }

  return results;
}

if (require.main === module) {
  runPlannerBenchmarks().catch(console.error);
}
