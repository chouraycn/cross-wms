import { describe, it, expect } from 'vitest';
import { explainShellCommand, type CommandExplanation, type CommandStep, type CommandRisk } from '../extract';

describe('explainShellCommand', () => {
  describe('basic functionality', () => {
    it('should handle empty string', async () => {
      const result = await explainShellCommand('');
      expect(result).toEqual<CommandExplanation>({
        ok: true,
        source: '',
        shapes: [],
        topLevelCommands: [],
        nestedCommands: [],
        operators: [],
        risks: [],
      });
    });

    it('should handle whitespace-only string', async () => {
      const result = await explainShellCommand('   ');
      expect(result).toEqual<CommandExplanation>({
        ok: true,
        source: '   ',
        shapes: [],
        topLevelCommands: [],
        nestedCommands: [],
        operators: [],
        risks: [],
      });
    });

    it('should parse simple single command', async () => {
      const result = await explainShellCommand('ls');
      expect(result.ok).toBe(true);
      expect(result.source).toBe('ls');
      expect(result.shapes).toEqual([]);
      expect(result.topLevelCommands).toHaveLength(1);
      expect(result.nestedCommands).toEqual([]);
      expect(result.operators).toEqual([]);
      expect(result.risks).toEqual([]);

      const cmd = result.topLevelCommands[0];
      expect(cmd.executable).toBe('ls');
      expect(cmd.argv).toEqual(['ls']);
      expect(cmd.context).toBe('top-level');
      expect(cmd.text).toBe('ls');
      expect(cmd.span.startIndex).toBe(0);
      expect(cmd.span.endIndex).toBe(2);
    });

    it('should parse command with arguments', async () => {
      const result = await explainShellCommand('git commit -m "test message"');
      expect(result.ok).toBe(true);
      expect(result.topLevelCommands).toHaveLength(1);

      const cmd = result.topLevelCommands[0];
      expect(cmd.executable).toBe('git');
      // Note: simplified parser splits by whitespace, so quoted strings are not treated as single arguments
      expect(cmd.argv).toEqual(['git', 'commit', '-m', '"test', 'message"']);
    });

    it('should handle multiple whitespace between arguments', async () => {
      const result = await explainShellCommand('echo   hello    world');
      expect(result.ok).toBe(true);
      expect(result.topLevelCommands).toHaveLength(1);

      const cmd = result.topLevelCommands[0];
      expect(cmd.executable).toBe('echo');
      expect(cmd.argv).toEqual(['echo', 'hello', 'world']);
    });
  });

  describe('command operators', () => {
    it('should parse commands separated by semicolon', async () => {
      const result = await explainShellCommand('ls; pwd');
      expect(result.ok).toBe(true);
      expect(result.topLevelCommands).toHaveLength(2);
      expect(result.shapes).toContain('sequence');

      expect(result.topLevelCommands[0].executable).toBe('ls');
      expect(result.topLevelCommands[1].executable).toBe('pwd');
    });

    it('should parse commands with AND operator (&&)', async () => {
      const result = await explainShellCommand('mkdir test && cd test');
      expect(result.ok).toBe(true);
      expect(result.topLevelCommands).toHaveLength(2);
      expect(result.shapes).toContain('and');

      expect(result.topLevelCommands[0].executable).toBe('mkdir');
      expect(result.topLevelCommands[1].executable).toBe('cd');
    });

    it('should parse commands with OR operator (||)', async () => {
      const result = await explainShellCommand('test -f file || echo "not found"');
      expect(result.ok).toBe(true);
      expect(result.topLevelCommands).toHaveLength(2);
      expect(result.shapes).toContain('or');

      expect(result.topLevelCommands[0].executable).toBe('test');
      expect(result.topLevelCommands[1].executable).toBe('echo');
    });

    it('should parse pipeline commands', async () => {
      const result = await explainShellCommand('cat file.txt | grep pattern');
      expect(result.ok).toBe(true);
      expect(result.topLevelCommands).toHaveLength(1);
      expect(result.shapes).toContain('pipeline');
    });

    it('should parse complex command chain with multiple operators', async () => {
      const result = await explainShellCommand('mkdir build && cd build ; echo "done" || echo "failed"');
      expect(result.ok).toBe(true);
      expect(result.shapes).toContain('and');
      expect(result.shapes).toContain('or');
      expect(result.shapes).toContain('sequence');
    });
  });

  describe('risk detection', () => {
    it('should detect eval command as risk', async () => {
      const result = await explainShellCommand('eval "export PATH=/usr/bin"');
      expect(result.ok).toBe(true);
      expect(result.risks).toHaveLength(1);
      expect(result.risks[0].kind).toBe('eval');
      expect(result.risks[0].text).toContain('eval');
    });

    it('should detect eval case-insensitively', async () => {
      const result = await explainShellCommand('EVAL "some code"');
      expect(result.ok).toBe(true);
      expect(result.risks).toHaveLength(1);
      expect(result.risks[0].kind).toBe('eval');
    });

    it('should detect source command as risk', async () => {
      const result = await explainShellCommand('source script.sh');
      expect(result.ok).toBe(true);
      expect(result.risks).toHaveLength(1);
      expect(result.risks[0].kind).toBe('source');
      expect((result.risks[0] as unknown).command).toBe('source');
    });

    it('should detect dot (.) command as source risk', async () => {
      const result = await explainShellCommand('. script.sh');
      expect(result.ok).toBe(true);
      expect(result.risks).toHaveLength(1);
      expect(result.risks[0].kind).toBe('source');
      expect((result.risks[0] as unknown).command).toBe('.');
    });

    it('should detect shell wrapper with -c flag', async () => {
      const result = await explainShellCommand('bash -c "echo hello"');
      expect(result.ok).toBe(true);
      expect(result.risks).toHaveLength(1);
      expect(result.risks[0].kind).toBe('shell-wrapper');
      expect((result.risks[0] as unknown).executable).toBe('bash');
      expect((result.risks[0] as unknown).flag).toBe('-c');
      // Note: simplified parser splits by whitespace, so payload is just the next argument
      expect((result.risks[0] as unknown).payload).toBe('"echo');
    });

    it('should detect different shell wrappers', async () => {
      const shells = ['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish'];
      
      for (const shell of shells) {
        const result = await explainShellCommand(`${shell} -c "test"`);
        expect(result.ok).toBe(true);
        expect(result.risks).toHaveLength(1);
        expect(result.risks[0].kind).toBe('shell-wrapper');
        expect((result.risks[0] as unknown).executable).toBe(shell);
      }
    });

    it('should detect multiple risks in single command', async () => {
      const result = await explainShellCommand('eval "code" && source script.sh');
      expect(result.ok).toBe(true);
      expect(result.risks).toHaveLength(2);
      expect(result.risks.some(r => r.kind === 'eval')).toBe(true);
      expect(result.risks.some(r => r.kind === 'source')).toBe(true);
    });

    it('should not detect shell wrapper without -c flag', async () => {
      const result = await explainShellCommand('bash script.sh');
      expect(result.ok).toBe(true);
      expect(result.risks).toHaveLength(0);
    });

    it('should not detect shell wrapper when -c has no payload', async () => {
      const result = await explainShellCommand('bash -c');
      expect(result.ok).toBe(true);
      expect(result.risks).toHaveLength(0);
    });
  });

  describe('source span tracking', () => {
    it('should correctly track source spans for simple command', async () => {
      const result = await explainShellCommand('ls');
      const cmd = result.topLevelCommands[0];
      expect(cmd.span.startIndex).toBe(0);
      expect(cmd.span.endIndex).toBe(2);
    });

    it('should correctly track source spans for multiple commands', async () => {
      const result = await explainShellCommand('ls; pwd');
      expect(result.topLevelCommands).toHaveLength(2);
      
      // First command
      expect(result.topLevelCommands[0].span.startIndex).toBe(0);
      expect(result.topLevelCommands[0].span.endIndex).toBe(2);
      
      // Second command (starts after "; ")
      expect(result.topLevelCommands[1].span.startIndex).toBe(4);
      expect(result.topLevelCommands[1].span.endIndex).toBe(7);
    });

    it('should track source spans with leading whitespace', async () => {
      const result = await explainShellCommand('   ls');
      const cmd = result.topLevelCommands[0];
      expect(cmd.span.startIndex).toBe(3);
      expect(cmd.span.endIndex).toBe(5);
    });
  });

  describe('command ID generation', () => {
    it('should generate unique IDs for multiple commands', async () => {
      const result = await explainShellCommand('ls; pwd; echo test');
      expect(result.topLevelCommands).toHaveLength(3);
      
      const ids = result.topLevelCommands.map(cmd => cmd.id);
      expect(new Set(ids).size).toBe(3);
      
      expect(ids[0]).toBe('command-0');
      expect(ids[1]).toBe('command-1');
      expect(ids[2]).toBe('command-2');
    });
  });

  describe('edge cases', () => {
    it('should handle leading and trailing whitespace', async () => {
      const result = await explainShellCommand('  ls -la  ');
      expect(result.ok).toBe(true);
      expect(result.topLevelCommands).toHaveLength(1);
      expect(result.topLevelCommands[0].executable).toBe('ls');
    });

    it('should preserve original source in result', async () => {
      const source = '  ls -la  ';
      const result = await explainShellCommand(source);
      expect(result.source).toBe(source);
    });

    it('should handle commands with special characters', async () => {
      const result = await explainShellCommand('echo "hello world"');
      expect(result.ok).toBe(true);
      // Note: simplified parser splits by whitespace, so quoted strings are not treated as single arguments
      expect(result.topLevelCommands[0].argv).toEqual(['echo', '"hello', 'world"']);
    });
  });
});