import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GeneratedFileArtifactCard from '../GeneratedFileArtifactCard';
import type { GeneratedFile } from '../../../types/chat';

function makeFile(over: Partial<GeneratedFile>): GeneratedFile {
  return {
    fileName: 'resume.html',
    fileSize: 2048,
    downloadUrl: '/files/resume.html',
    previewUrl: '/preview/resume.html',
    ...over,
  } as GeneratedFile;
}

describe('GeneratedFileArtifactCard', () => {
  it('renders file name and formatted size', () => {
    render(<GeneratedFileArtifactCard file={makeFile({ fileName: 'a.html', fileSize: 2048 })} isDark={false} />);
    expect(screen.getByText('a.html')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('calls onOpen with the file when provided', () => {
    const onOpen = vi.fn();
    const file = makeFile({});
    render(<GeneratedFileArtifactCard file={file} isDark={false} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('resume.html'));
    expect(onOpen).toHaveBeenCalledWith(file);
  });

  it('opens previewUrl in new window for previewable files when no onOpen', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<GeneratedFileArtifactCard file={makeFile({ fileName: 'doc.pdf', previewUrl: '/p.pdf' })} isDark={false} />);
    fireEvent.click(screen.getByText('doc.pdf'));
    expect(openSpy).toHaveBeenCalledWith('/p.pdf', '_blank', 'width=1024,height=768');
    openSpy.mockRestore();
  });

  it('falls back to download anchor click for non-previewable files', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<GeneratedFileArtifactCard file={makeFile({ fileName: 'data.bin', downloadUrl: '/d.bin' })} isDark={false} />);
    fireEvent.click(screen.getByText('data.bin'));
    expect(openSpy).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('renders an icon for the file type', () => {
    const { container } = render(<GeneratedFileArtifactCard file={makeFile({ fileName: 'x.pdf' })} isDark={false} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
