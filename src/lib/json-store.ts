import fs from "node:fs";
import path from "node:path";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "msg_mh2k3x_a1b2" — sortable enough for a flat file. */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** A JSON array persisted at data/<dir>/<file>, newest entry first. */
export function jsonStore<T>(dir: string, file: string) {
  const dataDir = path.join(process.cwd(), "data", dir);
  const dataFile = path.join(dataDir, file);

  const read = (): T[] => {
    try {
      const parsed = JSON.parse(fs.readFileSync(dataFile, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  /** Prepend an entry, keeping at most `max` entries; returns the new count. */
  const add = (entry: T, max = Infinity): number => {
    const items = [entry, ...read()].slice(0, max);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(items, null, 2));
    return items.length;
  };

  return { read, add };
}
