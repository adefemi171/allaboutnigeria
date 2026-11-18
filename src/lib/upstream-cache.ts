export interface Cached<T> {
  value: T;
  fetchedAt: number;
}

/**
 * Wrap a call to someone else's API in a small in-memory cache, so repeat questions
 * don't reach them. If a refresh fails, the last good answer is served instead.
 */
export function cachedUpstream<T>(
  ttlMs: number,
  maxEntries: number,
  load: (key: string) => Promise<T>
): (key: string) => Promise<Cached<T>> {
  const cache = new Map<string, Cached<T>>();
  const inFlight = new Map<string, Promise<Cached<T>>>();

  return (key) => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < ttlMs) return Promise.resolve(cached);

    let request = inFlight.get(key);
    if (!request) {
      request = load(key)
        .then((value) => {
          const entry = { value, fetchedAt: Date.now() };
          // Re-insert so the Map's order is oldest-written first, then trim
          cache.delete(key);
          cache.set(key, entry);
          if (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
          return entry;
        })
        .catch((err) => {
          if (cached) return cached;
          throw err;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, request);
    }
    return request;
  };
}

/** Identify ourselves to the free services we call. */
export const UPSTREAM_HEADERS = { "User-Agent": "AllAboutNigeria-Sky/1.0 (https://allaboutnigeria.ng)" };
