import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BotMessageContent } from '../BotMessageContent';
import { getGrayScale } from '../../../constants/theme';
import type { GeneratedFile, Message } from '../../../types/chat';

function makeFile(name: string): GeneratedFile {
  return {
    fileName: name,
    fileSize: 1024,
    downloadUrl: `/${name}`,
    previewUrl: `/${name}`,
  } as GeneratedFile;
}

function makeMsg(files: GeneratedFile[]): Message {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    generatedFiles: files,
  } as Message;
}

const gs = getGrayScale(false);

describe('BotMessageContent generated artifacts', () => {
  it('shows "查看所有产物" header with count', () => {
    const files = Array.from({ length: 6 }, (_, i) => makeFile(`f${i}.html`));
    render(<BotMessageContent msg={makeMsg(files)} gs={gs} isDark={false} copiedId={null} onCopy={() => {}} />);
    expect(screen.getByText('查看所有产物')).toBeInTheDocument();
    expect(screen.getByText('(6)')).toBeInTheDocument();
  });

  it('collapses to 4 cards initially and expands on toggle', () => {
    const files = Array.from({ length: 6 }, (_, i) => makeFile(`f${i}.html`));
    render(<BotMessageContent msg={makeMsg(files)} gs={gs} isDark={false} copiedId={null} onCopy={() => {}} />);

    // 初始仅展示前 4 个
    expect(screen.getByText('f0.html')).toBeInTheDocument();
    expect(screen.getByText('f3.html')).toBeInTheDocument();
    expect(screen.queryByText('f4.html')).not.toBeInTheDocument();

    // 点击「查看所有 6 个产物」展开
    fireEvent.click(screen.getByText(/查看所有 6 个产物/));
    expect(screen.getByText('f4.html')).toBeInTheDocument();
    expect(screen.getByText('f5.html')).toBeInTheDocument();
    // 收起按钮出现
    expect(screen.getByText('收起')).toBeInTheDocument();
  });

  it('does not show toggle when <= 4 files', () => {
    const files = Array.from({ length: 3 }, (_, i) => makeFile(`g${i}.html`));
    render(<BotMessageContent msg={makeMsg(files)} gs={gs} isDark={false} copiedId={null} onCopy={() => {}} />);
    // 标题「查看所有产物」常驻；仅折叠按钮「查看所有 N 个产物」在 <=4 时隐藏
    expect(screen.queryByText(/查看所有 \d+ 个产物/)).not.toBeInTheDocument();
    expect(screen.getByText('g0.html')).toBeInTheDocument();
  });

  it('invokes onCopy from props (smoke: render with callbacks)', () => {
    const onCopy = vi.fn();
    const files = Array.from({ length: 2 }, (_, i) => makeFile(`h${i}.html`));
    render(<BotMessageContent msg={makeMsg(files)} gs={gs} isDark={false} copiedId={null} onCopy={onCopy} />);
    expect(screen.getByText('h0.html')).toBeInTheDocument();
  });
});
