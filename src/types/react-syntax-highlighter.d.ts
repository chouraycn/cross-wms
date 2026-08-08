declare module 'react-syntax-highlighter' {
  export const PrismLight: React.ComponentType<{
    language?: string;
    style?: any;
    PreTag?: React.ComponentType<any>;
    customStyle?: React.CSSProperties;
    children?: React.ReactNode;
    [key: string]: any;
  }> & {
    registerLanguage(name: string, language: any): void;
  };
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/tsx' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/bash' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/json' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/python' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/sql' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/javascript' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/typescript' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/css' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/yaml' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/c' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/cpp' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/java' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/go' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/rust' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/markup' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/markdown' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/diff' {
  const language: any;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/one-light' {
  const style: any;
  export default style;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/one-dark' {
  const style: any;
  export default style;
}