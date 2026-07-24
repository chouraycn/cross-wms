/**
 * Desktop Clipboard Tools — clipboard read/write
 */

import { isMac, isLinux, PLATFORM } from '../toolTypes.js';

/** desktop_clipboard - Read/write clipboard using pbcopy/pbpaste */
export async function handleDesktopClipboard(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const action = String(args.action || 'get');
    const content = args.content ? String(args.content) : null;

    if (action === 'get') {
      if (isMac) {
        // Read from clipboard using pbpaste
        const output = execSync('pbpaste', {
          encoding: 'utf8',
          timeout: 3000,
        }).toString();

        return JSON.stringify({
          success: true,
          action: 'get',
          content: output,
        });
      } else if (isLinux) {
        try {
          const output = execSync('xclip -selection clipboard -o', { encoding: 'utf8', timeout: 3000 }).toString();
          return JSON.stringify({ success: true, action: 'get', content: output });
        } catch {
          const output = execSync('xsel --clipboard --output', { encoding: 'utf8', timeout: 3000 }).toString();
          return JSON.stringify({ success: true, action: 'get', content: output });
        }
      } else {
        return JSON.stringify({ success: false, error: `Unsupported platform: ${PLATFORM}` });
      }
    } else if (action === 'set') {
      if (!content) {
        return JSON.stringify({ success: false, error: 'content parameter is required for set action' });
      }

      if (isMac) {
        // Write to clipboard using pbcopy
        const { spawn } = await import('child_process');
        const child = spawn('pbcopy', [], { stdio: ['pipe', 'ignore', 'pipe'] });

        // Write content to stdin
        if (!child.stdin) throw new Error('child.stdin not available');
        child.stdin.write(content);
        child.stdin.end();

        // Wait for completion
        await new Promise<void>((resolve, reject) => {
          child.on('close', (code: number) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`pbcopy exited with code ${code}`));
            }
          });
          child.on('error', reject);
        });

        return JSON.stringify({
          success: true,
          action: 'set',
          contentLength: content.length,
        });
      } else if (isLinux) {
        try {
          const { spawn } = await import('child_process');
          const child = spawn('xclip', ['-selection', 'clipboard'], { stdio: ['pipe', 'ignore', 'pipe'] });
          if (!child.stdin) throw new Error('child.stdin not available');
          child.stdin.write(content);
          child.stdin.end();
          await new Promise<void>((resolve, reject) => {
            child.on('close', (code: number) => code === 0 ? resolve() : reject(new Error(`xclip exited with code ${code}`)));
            child.on('error', reject);
          });
          return JSON.stringify({ success: true, action: 'set', contentLength: content.length });
        } catch {
          // fallback to xsel
          execSync(`echo '${content.replace(/'/g, "'\\''")}' | xsel --clipboard --input`, { encoding: 'utf8', timeout: 3000, shell: '/bin/bash' });
          return JSON.stringify({ success: true, action: 'set', contentLength: content.length });
        }
      } else {
        return JSON.stringify({ success: false, error: `Unsupported platform: ${PLATFORM}` });
      }
    } else {
      return JSON.stringify({
        success: false,
        error: `Invalid action: ${action}. Use 'get' or 'set'`,
      });
    }
  } catch (e: unknown) {
    return JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : 'Clipboard operation failed',
    });
  }
}
