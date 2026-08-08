declare module 'jsdom' {
  export class JSDOM {
    constructor(html: string, options?: any);
    window: {
      document: Document;
      [key: string]: any;
    };
    static fromURL(url: string, options?: any): Promise<JSDOM>;
    static fromFile(path: string, options?: any): Promise<JSDOM>;
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
