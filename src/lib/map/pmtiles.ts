// Reads single tiles out of a PMTiles archive (version 3) over HTTP range
// requests: the header and root directory first, then a leaf directory if
// the tile is listed in one, then the tile. Directories are kept, so a
// second tile nearby costs one request.
//
// Only what the map needs: no metadata, gzip or no compression.
// The format: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md

interface Entry {
  tileId: number;
  offset: number;
  length: number;
  /** 0 for a pointer to a leaf directory. */
  runLength: number;
}

interface Header {
  rootOffset: number;
  rootLength: number;
  leafOffset: number;
  dataOffset: number;
  /** 1 none, 2 gzip. */
  internalCompression: number;
  tileCompression: number;
}

/** Bytes fetched at the start: the 127-byte header and, nearly always, the root directory. */
const FIRST_BYTES = 16384;

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Tiles are numbered along a Hilbert curve, zoom level after zoom level. */
function tileId(z: number, x: number, y: number): number {
  let id = (4 ** z - 1) / 3;
  let tx = x;
  let ty = y;
  for (let s = 2 ** (z - 1); s >= 1; s /= 2) {
    const rx = (tx & s) > 0 ? 1 : 0;
    const ry = (ty & s) > 0 ? 1 : 0;
    id += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        tx = s - 1 - tx;
        ty = s - 1 - ty;
      }
      [tx, ty] = [ty, tx];
    }
  }
  return id;
}

function directory(bytes: Uint8Array): Entry[] {
  let at = 0;
  // Varints here can pass 2^32 (offsets into a 180 GB file), so no bit operators.
  const varint = () => {
    let value = 0;
    let scale = 1;
    let byte: number;
    do {
      byte = bytes[at++];
      value += (byte & 0x7f) * scale;
      scale *= 128;
    } while (byte & 0x80);
    return value;
  };
  const count = varint();
  const entries: Entry[] = [];
  let last = 0;
  for (let i = 0; i < count; i++) {
    last += varint();
    entries.push({ tileId: last, offset: 0, length: 0, runLength: 1 });
  }
  for (const entry of entries) entry.runLength = varint();
  for (const entry of entries) entry.length = varint();
  entries.forEach((entry, i) => {
    const value = varint();
    entry.offset = value === 0 && i > 0 ? entries[i - 1].offset + entries[i - 1].length : value - 1;
  });
  return entries;
}

/** The entry that covers a tile: the last one whose id is not past it. */
function find(entries: Entry[], id: number): Entry | null {
  let low = 0;
  let high = entries.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (entries[mid].tileId <= id) low = mid + 1;
    else high = mid - 1;
  }
  const entry = entries[high];
  if (!entry) return null;
  if (entry.runLength === 0) return entry;
  return id - entry.tileId < entry.runLength ? entry : null;
}

export class PMTiles {
  private header: Promise<{ header: Header; root: Entry[] }> | null = null;
  private leaves = new Map<number, Promise<Entry[]>>();

  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  private async range(offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array> {
    // A plain Range header is a "simple" request, so there is no CORS
    // preflight, which the Overture CDN would refuse.
    const response = await fetch(this.url, {
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      signal,
    });
    if (!response.ok) throw new Error(`PMTiles: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // A server that ignores Range sends the whole file.
    return response.status === 200 ? bytes.subarray(offset, offset + length) : bytes;
  }

  private start(): Promise<{ header: Header; root: Entry[] }> {
    this.header ??= (async () => {
      const bytes = await this.range(0, FIRST_BYTES);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (String.fromCharCode(...bytes.subarray(0, 7)) !== "PMTiles" || bytes[7] !== 3) {
        throw new Error("PMTiles: not a version 3 archive");
      }
      const u64 = (at: number) => Number(view.getBigUint64(at, true));
      const header: Header = {
        rootOffset: u64(8),
        rootLength: u64(16),
        leafOffset: u64(40),
        dataOffset: u64(56),
        internalCompression: bytes[97],
        tileCompression: bytes[98],
      };
      const rootBytes =
        header.rootOffset + header.rootLength <= bytes.length
          ? bytes.subarray(header.rootOffset, header.rootOffset + header.rootLength)
          : await this.range(header.rootOffset, header.rootLength);
      return { header, root: directory(await this.unpack(rootBytes, header.internalCompression)) };
    })();
    // Shared by every tile, so it is not cancelled with any one of them. A
    // failed start is tried again by the next tile.
    this.header.catch(() => (this.header = null));
    return this.header;
  }

  private async unpack(bytes: Uint8Array, compression: number): Promise<Uint8Array> {
    if (compression === 1) return bytes;
    if (compression === 2) return gunzip(bytes);
    throw new Error(`PMTiles: compression ${compression} is not supported`);
  }

  /** The tile's bytes, uncompressed, or null where the archive has nothing. */
  async tile(z: number, x: number, y: number, signal?: AbortSignal): Promise<Uint8Array | null> {
    const { header, root } = await this.start();
    const id = tileId(z, x, y);
    let entries = root;
    for (let depth = 0; depth < 4; depth++) {
      const entry = find(entries, id);
      if (!entry) return null;
      if (entry.runLength > 0) {
        const bytes = await this.range(header.dataOffset + entry.offset, entry.length, signal);
        return this.unpack(bytes, header.tileCompression);
      }
      const at = header.leafOffset + entry.offset;
      let leaf = this.leaves.get(at);
      if (!leaf) {
        leaf = this.range(at, entry.length)
          .then((bytes) => this.unpack(bytes, header.internalCompression))
          .then(directory);
        leaf.catch(() => this.leaves.delete(at));
        this.leaves.set(at, leaf);
      }
      entries = await leaf;
    }
    return null;
  }
}
