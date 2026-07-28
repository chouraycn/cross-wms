import { useState } from 'react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';
import { cn } from './lib/utils.js';

// 复用主程序的 react-syntax-highlighter（PrismLight），不再自维护 token 解析器。
// 注册常见语言（与 MarkdownRenderer 对齐）；未注册语言会降级为纯文本渲染。
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('md', markdown);

export type CodeBlockProps = {
  code: string;
  language?: string;
  className?: string;
  /** Show a copy-to-clipboard button in the top-right corner. */
  showCopy?: boolean;
};

/** Code block with syntax highlighting (react-syntax-highlighter) and an optional copy button. */
export default function CodeBlock({ code, language, className, showCopy = true }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; ignore
    }
  }

  return (
    <div className={cn('relative group', className)}>
      {showCopy && (
        <button
          type="button"
          onClick={() => void copyCode()}
          className="absolute right-[8px] top-[8px] z-10 rounded-[6px] bg-white/80 px-[8px] py-[3px] text-[11px] text-[#464c5e] opacity-0 transition-opacity hover:bg-white group-hover:opacity-100"
          aria-label="复制代码"
        >
          {copied ? '已复制' : '复制'}
        </button>
      )}
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          background: '#1e1e1e',
          borderRadius: '10px',
          padding: '12px',
          fontSize: '12px',
          lineHeight: 1.6,
        }}
        codeTagProps={{
          style: {
            fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
            color: '#d4d4d4',
          },
        }}
        preTagProps={{ className: 'code-block-vscode' }}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
