declare module 'turndown' {
  interface Options {
    headingStyle?: 'setext' | 'atx';
    hr?: string;
    bulletListMarker?: '-' | '+' | '*';
    codeBlockStyle?: 'indented' | 'fenced';
    fence?: '```' | '~~~';
    emDelimiter?: '_' | '*';
    strongDelimiter?: '__' | '**';
    linkStyle?: 'inlined' | 'referenced';
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut';
  }

  class TurndownService {
    constructor(options?: Options);
    turndown(html: string | Node): string;
    use(plugins: ((service: TurndownService) => void)[]): TurndownService;
    addRule(key: string, rule: any): TurndownService;
    keep(filter: string | string[] | ((node: Node) => boolean)): TurndownService;
    remove(filter: string | string[] | ((node: Node) => boolean)): TurndownService;
    escape(str: string): string;
  }

  export default TurndownService;
}
