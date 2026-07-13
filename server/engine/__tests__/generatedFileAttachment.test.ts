import { describe, it, expect } from 'vitest';
import {
  makeFileId,
  extractFilesFromMarkerText,
  extractGeneratedFileFromToolResult,
  resolveDownloadUrl,
  buildGeneratedFilePayload,
} from '../generatedFileAttachment.js';

describe('makeFileId', () => {
  it('is stable for the same (sessionId, fileName)', () => {
    expect(makeFileId('sess1', 'report.html')).toBe(makeFileId('sess1', 'report.html'));
  });

  it('differs across sessions', () => {
    expect(makeFileId('sess1', 'report.html')).not.toBe(makeFileId('sess2', 'report.html'));
  });

  it('differs across file names', () => {
    expect(makeFileId('sess1', 'a.html')).not.toBe(makeFileId('sess1', 'b.html'));
  });

  it('is truncated to at most 18 chars', () => {
    const id = makeFileId('a-very-long-session-id', 'a-very-long-file-name.html');
    expect(id.length).toBeLessThanOrEqual(18);
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('extractFilesFromMarkerText', () => {
  it('extracts a single FILE: absolute path', () => {
    const text = 'doing work\nFILE:/tmp/out/report.html\ndone';
    expect(extractFilesFromMarkerText(text)).toEqual(['/tmp/out/report.html']);
  });

  it('extracts both FILE: and MEDIA: markers', () => {
    const text = 'MEDIA:/Users/x/img.png\nFILE:/a/b/c.pdf';
    const result = extractFilesFromMarkerText(text);
    expect(result).toContain('/Users/x/img.png');
    expect(result).toContain('/a/b/c.pdf');
    expect(result).toHaveLength(2);
  });

  it('deduplicates repeated markers', () => {
    const text = 'FILE:/x/y.txt\nFILE:/x/y.txt';
    expect(extractFilesFromMarkerText(text)).toEqual(['/x/y.txt']);
  });

  it('returns empty array when no markers present', () => {
    expect(extractFilesFromMarkerText('just some normal output without markers')).toEqual([]);
    expect(extractFilesFromMarkerText('')).toEqual([]);
  });

  it('requires the marker at line start (no false positives in prose)', () => {
    // A marker embedded in prose must NOT be treated as a real marker.
    const prose = 'the file is at FILE:/real/path.txt';
    expect(extractFilesFromMarkerText(prose)).toEqual([]);

    // A genuine line-start marker IS extracted.
    const real = 'please FILE: this is not a marker\nFILE:/real/path.txt';
    expect(extractFilesFromMarkerText(real)).toEqual(['/real/path.txt']);
  });
});

describe('extractGeneratedFileFromToolResult', () => {
  it('parses a successful file_generateFile result', () => {
    const result = extractGeneratedFileFromToolResult(
      'file_generateFile',
      JSON.stringify({
        success: true,
        fileName: 'r.html',
        fileSize: 123,
        sessionId: 'sess1',
        downloadUrl: '/api/file/generated/sess1/r.html',
        previewUrl: '/api/file/generated/sess1/r.html?preview=1',
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.fileName).toBe('r.html');
    expect(result!.fileSize).toBe(123);
    expect(result!.sessionId).toBe('sess1');
    expect(result!.fileId).toBe(makeFileId('sess1', 'r.html'));
    expect(result!.source).toBe('tool');
    expect(result!.downloadUrl).toBe('/api/file/generated/sess1/r.html');
  });

  it('returns null for a failed file_generateFile result', () => {
    expect(
      extractGeneratedFileFromToolResult('file_generateFile', JSON.stringify({ success: false })),
    ).toBeNull();
  });

  it('parses a successful file_writeFile result from a path', () => {
    const result = extractGeneratedFileFromToolResult(
      'file_writeFile',
      JSON.stringify({ success: true, path: '/Users/me/Desktop/note.md', bytesWritten: 42 }),
    );
    expect(result).not.toBeNull();
    expect(result!.fileName).toBe('note.md');
    expect(result!.fileSize).toBe(42);
  });

  it('accepts an already-augmented object (not just a JSON string)', () => {
    const result = extractGeneratedFileFromToolResult('file_generateFile', {
      success: true,
      fileName: 'x.json',
      fileSize: 1,
      sessionId: 's',
      downloadUrl: '/api/file/generated/s/x.json',
    } as Record<string, unknown>);
    expect(result?.fileName).toBe('x.json');
  });

  it('returns null for unknown tools', () => {
    expect(extractGeneratedFileFromToolResult('exec_command', '{"stdout":"x"}')).toBeNull();
  });

  it('returns null for unparseable JSON', () => {
    expect(extractGeneratedFileFromToolResult('file_generateFile', 'not json')).toBeNull();
  });
});

describe('resolveDownloadUrl / buildGeneratedFilePayload', () => {
  it('uses /api/file/fs for paths outside the generated dir', () => {
    const { downloadUrl, previewUrl } = resolveDownloadUrl('sess1', 'a.html', '/Users/me/Desktop/a.html');
    expect(downloadUrl).toContain('/api/file/fs?path=');
    expect(previewUrl).toBeUndefined();
  });

  it('builds a payload with a stable fileId even without a real file', () => {
    const payload = buildGeneratedFilePayload('sess1', 'a.html', { source: 'skill', skillId: 'mySkill' });
    expect(payload.fileId).toBe(makeFileId('sess1', 'a.html'));
    expect(payload.source).toBe('skill');
    expect(payload.skillId).toBe('mySkill');
    expect(payload.downloadUrl).toContain('/api/file/generated/sess1/a.html');
    expect(payload.previewUrl).toContain('preview=1');
  });
});
