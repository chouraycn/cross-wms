import {
  defineTest,
  defineSuite,
  runTest,
  runSuite,
  createMockTool,
  createMockCliTool,
  createMockApiTool,
  createMockFileTool,
  captureToolCalls,
  instrumentMockTool,
  assertEqual,
  assertNotEqual,
  assertMatch,
  assertContains,
  assertThrows,
  assertPasses,
  AssertionError,
} from '../testing/index.js';

describe('Skill Testing Framework', () => {
  describe('Assertions', () => {
    test('assertEqual should pass when values are equal', () => {
      assertEqual(42, 42);
      assertEqual('hello', 'hello');
      assertEqual(null, null);
    });

    test('assertEqual should throw when values are not equal', () => {
      expect(() => assertEqual(42, 100)).toThrow(AssertionError);
      expect(() => assertEqual('hello', 'world')).toThrow(AssertionError);
    });

    test('assertNotEqual should pass when values are not equal', () => {
      assertNotEqual(42, 100);
      assertNotEqual('hello', 'world');
    });

    test('assertNotEqual should throw when values are equal', () => {
      expect(() => assertNotEqual(42, 42)).toThrow(AssertionError);
    });

    test('assertMatch should pass when string matches regex', () => {
      assertMatch('hello world', /hello/);
      assertMatch('test@example.com', /^[\w.-]+@[\w.-]+\.\w+$/);
    });

    test('assertMatch should throw when string does not match', () => {
      expect(() => assertMatch('hello', /world/)).toThrow(AssertionError);
    });

    test('assertContains should pass when array contains value', () => {
      assertContains([1, 2, 3], 2);
      assertContains(['a', 'b', 'c'], 'b');
    });

    test('assertContains should throw when array does not contain value', () => {
      expect(() => assertContains([1, 2, 3], 4)).toThrow(AssertionError);
    });

    test('assertThrows should pass when function throws', async () => {
      await assertThrows(() => {
        throw new Error('test error');
      });
    });

    test('assertThrows should throw when function does not throw', async () => {
      await expect(assertThrows(() => {})).rejects.toThrow(AssertionError);
    });

    test('assertPasses should pass when function does not throw', async () => {
      await assertPasses(() => {});
      await assertPasses(async () => {});
    });

    test('assertPasses should throw when function throws', async () => {
      await expect(assertPasses(() => {
        throw new Error('test');
      })).rejects.toThrow(AssertionError);
    });
  });

  describe('Mock Tools', () => {
    test('createMockTool should create a mock tool', () => {
      const tool = createMockTool('test', async () => 'result');
      expect(tool.name).toBe('test');
      expect(tool.calls).toEqual([]);
    });

    test('createMockCliTool should create a CLI mock', () => {
      const tool = createMockCliTool('cli', 'output', 0);
      expect(tool.name).toBe('cli');
    });

    test('createMockApiTool should create an API mock', () => {
      const tool = createMockApiTool('api', { data: 'test' }, 200);
      expect(tool.name).toBe('api');
    });

    test('createMockFileTool should create a file mock', () => {
      const tool = createMockFileTool('file', 'content');
      expect(tool.name).toBe('file');
    });

    test('instrumentMockTool should capture calls', async () => {
      const tool = createMockTool('test', async () => 'ok');
      const instrumented = instrumentMockTool(tool);

      await instrumented.handler('arg1', 'arg2');
      await instrumented.handler('arg3');

      expect(tool.calls.length).toBe(2);
      expect(tool.calls[0].args).toEqual(['arg1', 'arg2']);
      expect(tool.calls[1].args).toEqual(['arg3']);
    });

    test('captureToolCalls should return call records', () => {
      const tool = createMockTool('test', async () => 'ok');
      tool.calls.push({ args: [1, 2], timestamp: Date.now() });

      const records = captureToolCalls(tool);
      expect(records.length).toBe(1);
      expect(records[0].args).toEqual([1, 2]);
    });
  });

  describe('Test Runner', () => {
    test('defineTest should create a SkillTest', () => {
      const test = defineTest('test', async () => ({ passed: true }));
      expect(test.name).toBe('test');
      expect(typeof test.handler).toBe('function');
    });

    test('defineSuite should create a TestSuite', () => {
      const suite = defineSuite('suite', {
        tests: [defineTest('test1', async () => ({ passed: true }))],
      });
      expect(suite.name).toBe('suite');
      expect(suite.tests.length).toBe(1);
    });

    test('runTest should execute a passing test', async () => {
      const test = defineTest('passing', async () => ({ passed: true }));
      const result = await runTest('skill', test);
      expect(result.passed).toBe(true);
      expect(result.durationMs).toBeDefined();
    });

    test('runTest should execute a failing test', async () => {
      const test = defineTest('failing', async () => ({ passed: false, error: 'test error' }));
      const result = await runTest('skill', test);
      expect(result.passed).toBe(false);
      expect(result.error).toBe('test error');
    });

    test('runTest should handle skipped tests', async () => {
      const test = defineTest('skipped', async () => ({ passed: true }));
      test.skip = true;
      const result = await runTest('skill', test);
      expect(result.passed).toBe(true);
      expect(result.message).toBe('Skipped');
    });

    test('runSuite should execute all tests', async () => {
      const suite = defineSuite('test-suite', {
        tests: [
          defineTest('test1', async () => ({ passed: true })),
          defineTest('test2', async () => ({ passed: true })),
        ],
      });

      const results = await runSuite(suite);
      expect(results.length).toBe(2);
      expect(results.every(r => r.passed)).toBe(true);
    });

    test('runSuite should handle beforeAll and afterAll', async () => {
      let beforeCalled = false;
      let afterCalled = false;

      const suite = defineSuite('lifecycle-suite', {
        beforeAll: async () => { beforeCalled = true; },
        afterAll: async () => { afterCalled = true; },
        tests: [defineTest('test', async () => ({ passed: true }))],
      });

      await runSuite(suite);
      expect(beforeCalled).toBe(true);
      expect(afterCalled).toBe(true);
    });
  });
});
