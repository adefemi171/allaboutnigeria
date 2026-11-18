// The 2 km grid behind the map: ground height, what each cell is, and how
// many people live there. Built by scripts/build-map-data.mjs.

import { worldToLatLon } from "./projection";

export const KIND_SEA = 0;
export const KIND_NG = 1;
export const KIND_FOREIGN = 2;
/** Lakes, lagoons, creeks and the big rivers inside Nigeria. */
export const KIND_WATER = 3;

export interface StateMeta {
  name: string;
  /** Shorter name for the map: "FCT". */
  label: string;
  iso: string;
  /** A spot well inside the state, scene km. */
  x: number;
  z: number;
  km2: number;
}

export interface GridMeta {
  /** Cell size, km. */
  cell: number;
  /** Scene position of the grid's north-west corner, km. */
  xMin: number;
  zMin: number;
  width: number;
  height: number;
  heightScale: number;
  peopleScale: number;
  states: StateMeta[];
  stats: {
    landKm2: number;
    inlandWaterKm2: number;
    highest: { metres: number; lat: number; lon: number };
    population: number;
    populationOnGrid: number;
    densestSquare: number;
    populationYear: number;
  };
}

export interface CellInfo {
  lat: number;
  lon: number;
  kind: "sea" | "land" | "water" | "abroad";
  state: StateMeta | null;
  /** Metres above sea level. Null for the sea and inland water. */
  elevation: number | null;
  /** Residents of this square, to within a few percent. */
  people: number;
}

export class Grid {
  readonly width: number;
  readonly height: number;
  /** Cell size in scene units (kilometres). */
  readonly cell: number;
  /** Scene coordinates of the grid's north-west corner. */
  readonly x0: number;
  readonly z0: number;
  /** Ground height of every cell, metres. */
  readonly metres: Float32Array;

  /** Sorted heights of every dry Nigerian cell. */
  private sortedLand: Float32Array;

  constructor(
    readonly meta: GridMeta,
    heights: Uint8Array,
    /** log2(1 + residents) * meta.peopleScale, see people(). */
    readonly population: Uint8Array,
    readonly flags: Uint8Array,
  ) {
    this.width = meta.width;
    this.height = meta.height;
    this.cell = meta.cell;
    this.x0 = meta.xMin;
    this.z0 = meta.zMin;
    this.metres = Float32Array.from(heights, (value) => (value / meta.heightScale) ** 2);
    const land: number[] = [];
    for (let c = 0; c < flags.length; c++) {
      if (this.isDryLand(c)) land.push(this.metres[c]);
    }
    this.sortedLand = Float32Array.from(land).sort();
  }

  get size(): number {
    return this.width * this.height;
  }
  get xMax(): number {
    return this.x0 + this.width * this.cell;
  }
  get zMax(): number {
    return this.z0 + this.height * this.cell;
  }

  kind(c: number): number {
    return this.flags[c] >> 6;
  }
  isDryLand(c: number): boolean {
    return this.kind(c) === KIND_NG;
  }
  /** Land or water inside the country. */
  isNigeria(c: number): boolean {
    const kind = this.kind(c);
    return kind === KIND_NG || kind === KIND_WATER;
  }
  state(c: number): StateMeta | null {
    const index = this.flags[c] & 63;
    return index ? this.meta.states[index - 1] : null;
  }
  people(c: number): number {
    const value = this.population[c];
    return value ? 2 ** (value / this.meta.peopleScale) - 1 : 0;
  }

  /** Cell index under a scene position, or -1 outside the grid. */
  cellAt(wx: number, wz: number): number {
    const i = Math.floor((wx - this.x0) / this.cell);
    const j = Math.floor((wz - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return -1;
    return j * this.width + i;
  }

  /** Scene position of a cell's centre, as [x, z]. */
  cellCentre(c: number): [number, number] {
    const i = c % this.width;
    const j = (c - i) / this.width;
    return [this.x0 + (i + 0.5) * this.cell, this.z0 + (j + 0.5) * this.cell];
  }

  info(c: number): CellInfo {
    const [wx, wz] = this.cellCentre(c);
    const [lat, lon] = worldToLatLon(wx, wz);
    const kind = this.kind(c);
    return {
      lat,
      lon,
      kind:
        kind === KIND_SEA ? "sea" : kind === KIND_FOREIGN ? "abroad" : kind === KIND_NG ? "land" : "water",
      state: this.state(c),
      elevation: kind === KIND_NG ? this.metres[c] : null,
      people: this.people(c),
    };
  }

  /** Share of Nigerian land (0 to 1) lying below a level in metres above the sea. */
  shareBelow(level: number): number {
    const sorted = this.sortedLand;
    let low = 0;
    let high = sorted.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (sorted[mid] < level) low = mid + 1;
      else high = mid;
    }
    return low / sorted.length;
  }

  /** Residents within a radius (km) of a scene position. */
  peopleWithin(wx: number, wz: number, radius: number): number {
    const reach = Math.ceil(radius / this.cell);
    const ci = Math.floor((wx - this.x0) / this.cell);
    const cj = Math.floor((wz - this.z0) / this.cell);
    let total = 0;
    for (let dj = -reach; dj <= reach; dj++) {
      for (let di = -reach; di <= reach; di++) {
        if ((di * di + dj * dj) * this.cell * this.cell > radius * radius) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= this.width || j >= this.height) continue;
        total += this.people(j * this.width + i);
      }
    }
    return total;
  }

  /** Residents per square kilometre around a scene position. */
  density(wx: number, wz: number): number {
    const cell = this.cellAt(wx, wz);
    return cell < 0 ? 0 : this.people(cell) / (this.cell * this.cell);
  }
}

async function gunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

/** The grid and its description, from the directory they were built into. */
export async function loadGrid(base: string, signal?: AbortSignal): Promise<Grid> {
  const [metaResponse, dataResponse] = await Promise.all([
    fetch(`${base}/grid.json`, { signal }),
    fetch(`${base}/grid.dat`, { signal }),
  ]);
  if (!metaResponse.ok || !dataResponse.ok) {
    throw new Error(`Could not load map data (${metaResponse.status}, ${dataResponse.status})`);
  }
  const meta = (await metaResponse.json()) as GridMeta;
  let buffer = await dataResponse.arrayBuffer();
  // The file is gzip. Some hosts unpack it on the way; check the magic bytes.
  const head = new Uint8Array(buffer, 0, 2);
  if (head[0] === 0x1f && head[1] === 0x8b) buffer = await gunzip(buffer);

  const n = meta.width * meta.height;
  if (buffer.byteLength !== n * 3) throw new Error("Map data does not match the grid description");
  // Heights are stored as differences along each row.
  const heights = new Uint8Array(buffer, 0, n);
  for (let c = 0; c < n; c++) {
    if (c % meta.width) heights[c] += heights[c - 1];
  }
  return new Grid(meta, heights, new Uint8Array(buffer, n, n), new Uint8Array(buffer, n * 2, n));
}
