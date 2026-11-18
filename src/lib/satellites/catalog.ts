// The orbits the page works with. The site's own /api/satellites passes
// on Celestrak's current elements; if it cannot, the snapshot that
// scripts/fetch-celestrak.mjs left in public/data stands in. Orbits a few
// days old still put a pass within seconds of where it was.

import type { GpRecord } from "./types";

/** What /api/satellites and the snapshot both hold. */
export interface CatalogFile {
  fetchedAt: string;
  /** Earth-watching, weather and crewed satellites: searched for passes. */
  search: GpRecord[];
  /** Science satellites and cubesats: only shown as dots on the globe. */
  others: GpRecord[];
}

export interface Catalog {
  search: GpRecord[];
  /** Every satellite the globe shows, the searched ones among them. */
  globe: GpRecord[];
}

async function loadJson(url: string, signal?: AbortSignal): Promise<CatalogFile> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  return (await response.json()) as CatalogFile;
}

export async function loadCatalog(signal?: AbortSignal): Promise<Catalog> {
  const file = await loadJson("/api/satellites", signal).catch((error) => {
    if (signal?.aborted) throw error;
    return loadJson("/data/celestrak.json", signal);
  });
  return { search: file.search, globe: [...file.search, ...file.others] };
}
