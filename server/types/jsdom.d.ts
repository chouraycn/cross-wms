declare module 'jsdom' {
  export class JSDOM {
    constructor(html: string, options?: unknown);
    window: {
      document: Document;
      [key: string]: unknown;
    };
    static fromURL(url: string, options?: unknown): Promise<JSDOM>;
    static fromFile(path: string, options?: unknown): Promise<JSDOM>;
  }
}

declare module '@mozilla/readability' {
  export interface ReadabilityOptions {
    debug?: boolean;
    maxElemsToParse?: number;
    nbTopCandidates?: number;
    charThreshold?: number;
    classesToPreserve?: string[];
    keepClasses?: boolean;
  }

  export interface ReadabilityResult {
    title: string;
    content: string;
    textContent: string;
    length: number;
    excerpt: string;
    byline: string;
    dir: string;
    siteName: string;
    lang: string;
    publishedTime: string | null;
  }

  export class Readability {
    constructor(doc: Document, options?: ReadabilityOptions);
    parse(): ReadabilityResult | null;
  }
}
