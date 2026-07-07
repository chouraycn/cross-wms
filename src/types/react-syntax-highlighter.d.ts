declare module 'react-syntax-highlighter' {
  export const PrismLight: React.ComponentType<{
    language?: string;
    style?: unknown;
    PreTag?: React.ComponentType<any>;
    customStyle?: React.CSSProperties;
    children?: React.ReactNode;
    [key: string]: unknown;
  }> & {
    registerLanguage(name: string, language: unknown): void;
  };
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/tsx' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/bash' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/json' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/python' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/sql' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/javascript' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/typescript' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/css' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/yaml' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/c' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/cpp' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/java' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/go' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/rust' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/markup' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/markdown' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/diff' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/one-light' {
  const style: unknown;
  export default style;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/one-dark' {
  const style: unknown;
  export default style;
}