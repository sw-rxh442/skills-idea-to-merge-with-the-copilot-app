import { describe, expect, it } from 'vitest';
import {
  addBookmark,
  formatBookmark,
  generateSlug,
  loadBookmarks,
  normalizeUrl,
} from './bookmarks';

const fixed = (n: number) => new Uint8Array(n).fill(7);

describe('normalizeUrl', () => {
  it('saves the same value with or without https://', () => {
    expect(normalizeUrl('www.example.com')).toBe('https://www.example.com');
    expect(normalizeUrl('https://www.example.com')).toBe(normalizeUrl('www.example.com'));
    expect(normalizeUrl('  https://www.example.com/ ')).toBe('https://www.example.com');
  });

  it('rejects invalid input', () => {
    for (const bad of ['', '   ', 'nope', 'javascript:alert(1)', 'ftp://example.com', 'a b.com', null, 42]) {
      expect(normalizeUrl(bad)).toBeNull();
    }
  });
});

describe('generateSlug', () => {
  it('creates a mona- base62 slug unique among existing ones', () => {
    const first = generateSlug([], fixed);
    expect(first).toMatch(/^mona-[0-9A-Za-z]{4}$/);
    expect(generateSlug([first], fixed)).not.toBe(first);
  });
});

describe('loadBookmarks', () => {
  it('recovers from empty, corrupted, and non-array values', () => {
    for (const raw of [null, undefined, '', '{not json', '{"url":"a.com"}', '"str"', '42', 'null', {}, 7]) {
      expect(loadBookmarks(raw)).toEqual([]);
    }
  });

  it('keeps valid entries and drops malformed ones', () => {
    const raw = JSON.stringify([
      { url: 'https://a.com', slug: 'mona-abcd' },
      { url: 'https://b.com', slug: 'bad slug' },
      { url: 5, slug: 'mona-zzzz' },
      null,
      [],
      { url: 'https://a.com', slug: 'mona-other' },
    ]);
    expect(loadBookmarks(raw)).toEqual([{ url: 'https://a.com', slug: 'mona-abcd' }]);
  });

  it('migrates legacy entries (URL strings or objects without a slug)', () => {
    const result = loadBookmarks(JSON.stringify(['example.com', { url: 'https://b.com' }]), fixed);
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('https://example.com');
    expect(result[0].slug).toMatch(/^mona-/);
    expect(result[0].slug).not.toBe(result[1].slug);
  });
});

describe('addBookmark / formatBookmark', () => {
  it('adds a normalised bookmark and rejects invalid or duplicate URLs', () => {
    const added = addBookmark([], 'example.com', fixed);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.bookmark.url).toBe('https://example.com');
    expect(addBookmark(added.bookmarks, 'https://example.com').ok).toBe(false);
    expect(addBookmark([], 'nope').ok).toBe(false);
  });

  it('formats as "<url> :: <slug>" with the exact separator', () => {
    expect(formatBookmark({ url: 'https://www.example.com', slug: 'mona-7fk2' })).toBe(
      'https://www.example.com :: mona-7fk2',
    );
  });
});
