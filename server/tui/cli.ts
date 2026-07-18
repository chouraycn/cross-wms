import { HttpBackend } from './httpBackend.js';
import { ChatServiceBackend } from './embeddedBackend.js';
import type { TUIConfig } from './config.js';
import { runTui } from './tui.js';

export interface CliArgs {
  http: boolean;
  url?: string;
  saveConfig: boolean;
  validateConfig: boolean;
  version: boolean;
  help: boolean;
  verbose: boolean;
  listBackends: boolean;
  config?: string;
  theme?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    http: false,
    url: undefined,
    saveConfig: false,
    validateConfig: false,
    version: false,
    help: false,
    verbose: false,
    listBackends: false,
    config: undefined,
    theme: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--http':
      case '-h':
        args.http = true;
        break;
      case '--url':
      case '-u':
        args.url = argv[++i];
        break;
      case '--save-config':
        args.saveConfig = true;
        break;
      case '--validate-config':
        args.validateConfig = true;
        break;
      case '--version':
      case '-v':
        args.version = true;
        break;
      case '--help':
        args.help = true;
        break;
      case '--verbose':
      case '-V':
        args.verbose = true;
        break;
      case '--list-backends':
        args.listBackends = true;
        break;
      case '--config':
      case '-c':
        args.config = argv[++i];
        break;
      case '--theme':
      case '-t':
        args.theme = argv[++i];
        break;
    }
  }

  return args;
}

export function selectBackend(config: TUIConfig, args: CliArgs): HttpBackend | ChatServiceBackend {
  if (args.http || config.backend === 'http') {
    const baseUrl = args.url || config.http.baseUrl;
    return new HttpBackend({ baseUrl, apiKey: config.http.apiKey });
  }
  return new ChatServiceBackend();
}

export async function runTuiCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('CrossWMS TUI - Terminal User Interface');
    console.log('');
    console.log('Usage: crosswms tui [options]');
    console.log('');
    console.log('Options:');
    console.log('  --http, -h           Use HTTP backend');
    console.log('  --url, -u <url>      HTTP backend URL');
    console.log('  --config, -c <path>  Config file path');
    console.log('  --theme, -t <theme>  Theme mode (auto/light/dark)');
    console.log('  --version, -v        Show version');
    console.log('  --help               Show help');
    return;
  }
  if (args.version) {
    console.log('CrossWMS TUI v1.0.0');
    return;
  }
  await runTui({ themeMode: (args.theme as any) || 'auto' });
}
