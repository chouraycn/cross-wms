export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    const msg = message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    throw new AssertionError(msg);
  }
}

export function assertNotEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual === expected) {
    const msg = message || `Expected value not to equal ${JSON.stringify(expected)}`;
    throw new AssertionError(msg);
  }
}

export function assertMatch(actual: string, pattern: RegExp, message?: string): void {
  if (!pattern.test(actual)) {
    const msg = message || `Expected "${actual}" to match ${pattern}`;
    throw new AssertionError(msg);
  }
}

export function assertContains<T>(actual: T[], expected: T, message?: string): void {
  if (!actual.includes(expected)) {
    const msg = message || `Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`;
    throw new AssertionError(msg);
  }
}

export async function assertThrows<T extends Error>(
  fn: () => Promise<void> | void,
  expectedError?: new (...args: unknown[]) => T | RegExp,
  message?: string
): Promise<void> {
  try {
    if (fn.constructor.name === 'AsyncFunction') {
      await (fn as () => Promise<void>)();
    } else {
      fn();
    }
    throw new AssertionError(message || 'Expected function to throw an error');
  } catch (error) {
    if (error instanceof AssertionError && !(expectedError && error.message === 'Expected function to throw an error')) {
      throw error;
    }
    if (expectedError) {
      if (expectedError instanceof RegExp) {
        if (!(error instanceof Error) || !expectedError.test(error.message)) {
          const msg = message || `Expected error message to match ${expectedError}, got "${error instanceof Error ? error.message : error}"`;
          throw new AssertionError(msg);
        }
      } else {
        if (!(error instanceof expectedError)) {
          const msg = message || `Expected error of type ${expectedError.name}, got ${error instanceof Error ? error.name : typeof error}`;
          throw new AssertionError(msg);
        }
      }
    }
  }
}

export async function assertPasses(fn: () => Promise<void> | void, message?: string): Promise<void> {
  try {
    if (fn.constructor.name === 'AsyncFunction') {
      await (fn as () => Promise<void>)();
    } else {
      fn();
    }
  } catch (error) {
    const msg = message || `Expected function to pass without throwing, but got: ${error instanceof Error ? error.message : error}`;
    throw new AssertionError(msg);
  }
}
