// Pure, browser-API-free helpers. Safe to import at build time and in unit tests.

export interface Bookmark {
  url: string;
  slug: string;
}

export const STORAGE_KEY = 'mona-bookmarks';
export const SLUG_PREFIX = 'mona-';
export const SEPARATOR = ' :: ';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SLUG_PATTERN = /^mona-[0-9A-Za-z]{1,16}$/;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

type Random = (n: number) => Uint8Array;

/** Normalise user input to a canonical http(s) URL, or return null if invalid. */
export function normalizeUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const candidate = SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname;
  if (!host || (!host.includes('.') && host !== 'localhost')) return null;

  let result = parsed.href;
  if (parsed.pathname === '/' && !parsed.search && !parsed.hash) {
    result = result.slice(0, -1);
  }
  return result;
}

export function isValidSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG_PATTERN.test(value);
}

function defaultRandom(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** Generate a short "mona-xxxx" base62 slug that is unique among `existing`. */
export function generateSlug(
  existing: Iterable<string> = [],
  random: Random = defaultRandom,
  length = 4,
): string {
  const taken = new Set(existing);
  for (let attempt = 0; attempt < 1000; attempt++) {
    // Widen after many collisions so the loop always finds a unique slug.
    const len = length + Math.floor(attempt / 50);
    const bytes = random(len);
    let body = '';
    for (let i = 0; i < len; i++) body += BASE62[bytes[i] % BASE62.length];
    const slug = SLUG_PREFIX + body;
    if (!taken.has(slug)) return slug;
  }
  throw new Error('Could not generate a unique slug');
}

/**
 * Validate untrusted stored data. Never throws; drops malformed entries,
 * de-duplicates, and migrates legacy entries (plain URL strings or {url} only).
 */
export function loadBookmarks(raw: unknown, random: Random = defaultRandom): Bookmark[] {
  try {
    let data: unknown = raw;
    if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(data)) return [];

    const result: Bookmark[] = [];
    const slugs = new Set<string>();
    const urls = new Set<string>();

    for (const item of data) {
      let rawUrl: unknown;
      let rawSlug: unknown;
      if (typeof item === 'string') {
        rawUrl = item;
      } else if (item && typeof item === 'object' && !Array.isArray(item)) {
        rawUrl = (item as Record<string, unknown>).url;
        rawSlug = (item as Record<string, unknown>).slug;
      } else {
        continue;
      }

      const url = normalizeUrl(rawUrl);
      if (!url || urls.has(url)) continue;
      if (rawSlug !== undefined && !isValidSlug(rawSlug)) continue;

      const slug =
        typeof rawSlug === 'string' && !slugs.has(rawSlug) ? rawSlug : generateSlug(slugs, random);
      urls.add(url);
      slugs.add(slug);
      result.push({ url, slug });
    }
    return result;
  } catch {
    return [];
  }
}

export type AddResult =
  | { ok: true; bookmarks: Bookmark[]; bookmark: Bookmark }
  | { ok: false; error: string };

/** Validate, normalise and add a URL. Does not mutate `bookmarks`. */
export function addBookmark(
  bookmarks: Bookmark[],
  input: unknown,
  random: Random = defaultRandom,
): AddResult {
  const url = normalizeUrl(input);
  if (!url) {
    return {
      ok: false,
      error: 'Enter a valid web address, for example example.com or https://example.com.',
    };
  }
  if (bookmarks.some((b) => b.url === url)) {
    return { ok: false, error: 'That link is already saved.' };
  }
  const slug = generateSlug(bookmarks.map((b) => b.slug), random);
  const bookmark = { url, slug };
  return { ok: true, bookmarks: [...bookmarks, bookmark], bookmark };
}

export function formatBookmark(bookmark: Bookmark): string {
  return `${bookmark.url}${SEPARATOR}${bookmark.slug}`;
}
