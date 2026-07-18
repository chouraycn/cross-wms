import { describe, expect, it } from 'vitest';
import { extractUrls, addOsc8Hyperlinks, stripOsc8AndAnsi } from '../osc8-hyperlinks.js';

describe('extractUrls', () => {
  it('extracts bare URLs', () => {
    const md = 'Visit https://example.com for more info';
    const urls = extractUrls(md);
    expect(urls).toContain('https://example.com');
  });

  it('extracts markdown link URLs', () => {
    const md = 'Check out [this link](https://example.com/page)';
    const urls = extractUrls(md);
    expect(urls).toContain('https://example.com/page');
  });

  it('extracts both bare and markdown links', () => {
    const md = 'Visit [site](https://example.com) or https://other.com';
    const urls = extractUrls(md);
    expect(urls).toContain('https://example.com');
    expect(urls).toContain('https://other.com');
  });

  it('returns empty array for no URLs', () => {
    const urls = extractUrls('Just plain text');
    expect(urls).toEqual([]);
  });

  it('handles empty string', () => {
    expect(extractUrls('')).toEqual([]);
  });

  it('deduplicates URLs', () => {
    const md = 'https://example.com and https://example.com again';
    const urls = extractUrls(md);
    expect(urls.length).toBe(1);
  });
});

describe('addOsc8Hyperlinks', () => {
  it('returns lines unchanged when no URLs', () => {
    const lines = ['Hello world', 'Another line'];
    const result = addOsc8Hyperlinks(lines, []);
    expect(result).toEqual(lines);
  });

  it('wraps URLs with OSC 8 sequences', () => {
    const lines = ['Visit https://example.com'];
    const urls = ['https://example.com'];
    const result = addOsc8Hyperlinks(lines, urls);
    expect(result[0]).toContain('\x1b]8;;');
    expect(result[0]).toContain('https://example.com');
  });

  it('handles multiple lines', () => {
    const lines = ['Line 1 https://a.com', 'Line 2 https://b.com'];
    const urls = ['https://a.com', 'https://b.com'];
    const result = addOsc8Hyperlinks(lines, urls);
    expect(result.length).toBe(2);
    expect(result[0]).toContain('\x1b]8;;');
    expect(result[1]).toContain('\x1b]8;;');
  });
});

describe('stripOsc8AndAnsi', () => {
  it('strips ANSI codes', () => {
    const text = '\x1b[31mRed\x1b[0m';
    expect(stripOsc8AndAnsi(text)).toBe('Red');
  });

  it('strips OSC 8 sequences', () => {
    const text = '\x1b]8;;https://example.com\x07link\x1b]8;;\x07';
    expect(stripOsc8AndAnsi(text)).toBe('link');
  });

  it('returns plain text unchanged', () => {
    expect(stripOsc8AndAnsi('Hello')).toBe('Hello');
  });
});
