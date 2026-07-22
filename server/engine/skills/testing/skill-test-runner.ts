import { logger } from '../../../logger.js';

export interface SkillTest {
  name: string;
  description?: string;
  handler: TestHandler;
  skip?: boolean;
  timeout?: number;
}

export interface TestContext {
  skillName: string;
  skillDir: string;
  tools: Record<string, MockTool>;
  logger: typeof logger;
}

export interface TestResult {
  passed: boolean;
  message?: string;
  durationMs?: number;
  error?: string;
}

export interface TestSuite {
  name: string;
  tests: SkillTest[];
  beforeAll?: () => Promise<void>;
  afterAll?: () => Promise<void>;
}

export type TestHandler = (context: TestContext) => Promise<TestResult>;

export interface MockTool {
  name: string;
  handler: (...args: unknown[]) => Promise<unknown>;
  calls: Array<{ args: unknown[]; timestamp: number }>;
}

export function defineTest(name: string, handler: TestHandler): SkillTest {
  return { name, handler };
}

export function defineSuite(name: string, suite: Omit<TestSuite, 'name'>): TestSuite {
  return { name, ...suite };
}

export async function runTest(skillName: string, test: SkillTest, tools: Record<string, MockTool> = {}): Promise<TestResult> {
  if (test.skip) {
    logger.info(`  ⏭️  [SKIP] ${test.name}`);
    return { passed: true, message: 'Skipped' };
  }

  const startTime = Date.now();
  const context: TestContext = {
    skillName,
    skillDir: '',
    tools,
    logger,
  };

  try {
    const result = await Promise.race([
      test.handler(context),
      new Promise<TestResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Test timeout after ${test.timeout || 30000}ms`));
        }, test.timeout || 30000);
      }),
    ]);

    const durationMs = Date.now() - startTime;
    const finalResult: TestResult = { ...result, durationMs };

    if (finalResult.passed) {
      logger.info(`  ✅ [PASS] ${test.name} (${durationMs}ms)`);
    } else {
      logger.error(`  ❌ [FAIL] ${test.name} (${durationMs}ms)`);
      if (finalResult.error) {
        logger.error(`     Error: ${finalResult.error}`);
      }
    }

    return finalResult;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(`  ❌ [FAIL] ${test.name} (${durationMs}ms)`);
    logger.error(`     Error: ${errorMessage}`);

    return {
      passed: false,
      message: 'Test threw an exception',
      durationMs,
      error: errorMessage,
    };
  }
}

export async function runSuite(suite: TestSuite): Promise<TestResult[]> {
  logger.info(`\n🏃 Running suite: ${suite.name}`);
  logger.info(`===============================`);

  const results: TestResult[] = [];

  if (suite.beforeAll) {
    try {
      await suite.beforeAll();
    } catch (error) {
      logger.error(`❌ beforeAll failed: ${error instanceof Error ? error.message : error}`);
      return results;
    }
  }

  for (const test of suite.tests) {
    const result = await runTest(suite.name, test);
    results.push(result);
  }

  if (suite.afterAll) {
    try {
      await suite.afterAll();
    } catch (error) {
      logger.error(`❌ afterAll failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const skipped = results.filter(r => r.message === 'Skipped').length;

  logger.info(`\n📊 Suite Summary: ${suite.name}`);
  logger.info(`  Passed: ${passed}, Failed: ${total - passed - skipped}, Skipped: ${skipped}`);

  return results;
}

export async function runAllTests(skillDir: string): Promise<{ total: number; passed: number; failed: number }> {
  logger.info(`\n🚀 Running all tests in: ${skillDir}`);
  logger.info(`=====================================`);

  const total = 0;
  const passed = 0;
  const failed = 0;

  return { total, passed, failed };
}

export function formatTestResult(result: TestResult): string {
  const parts = [];
  parts.push(result.passed ? 'PASS' : 'FAIL');
  if (result.durationMs) {
    parts.push(`(${result.durationMs}ms)`);
  }
  if (result.message) {
    parts.push(`- ${result.message}`);
  }
  if (result.error) {
    parts.push(`\nError: ${result.error}`);
  }
  return parts.join(' ');
}
