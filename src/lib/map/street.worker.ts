// Builds street-level tiles off the main thread: downloads the data for one
// tile, turns it into triangles, and hands the arrays back.
//
// A tile has two parts that load separately. "ground" is everything flat:
// land use, water, roads and railways, plus the names found on them and
// the trees. "buildings" is the blocks that stand on it.
//
// The work is done on a square the size of the tile, in km from its
// north-west corner. Everything that stands up or moves is then put in its
// place in the scene with warp() (street-tiles.ts); the flat ground is sent
// as fractions of the tile and placed by the shader the same way.

import { VectorTile, classifyRings, type VectorTileFeature } from "@mapbox/vector-tile";
import earcut from "earcut";
import { PbfReader } from "pbf";
import { PMTiles } from "./pmtiles";
import {
  SURFACE,
  TILE_ZOOM,
  tileCorners,
  tileSide,
  warp,
  type Corners,
  type GroundMesh,
  type MoverKey,
  type RouteLines,
  type SolidMesh,
  type StreetLabel,
  type StreetRequest,
  type StreetResponse,
} from "./street-tiles";
import { BUILDING_BANDS, ROOFS, STREET, hash, hex, type RGB } from "./style";

type Properties = Record<string, number | string | boolean>;
/** A ring or a line as x, z, x, z ... in km from the tile corner. */
type Path = number[];

const M = 0.001; // one metre in scene units

// --------------------------------------------------------------- sources --

/** OpenFreeMap publishes a new set of tiles every week, under a new path. */
const OPENFREEMAP = "https://tiles.openfreemap.org/planet";
/** Overture deletes old releases after a couple of months; the catalog names the latest. */
const OVERTURE_CATALOG = "https://stac.overturemaps.org/catalog.json";

let groundTemplate: Promise<string> | null = null;
let overture: Promise<PMTiles> | null = null;

function groundUrl(col: number, row: number): Promise<string> {
  groundTemplate ??= fetch(OPENFREEMAP)
    .then((response) => {
      if (!response.ok) throw new Error(`OpenFreeMap: HTTP ${response.status}`);
      return response.json() as Promise<{ tiles: string[] }>;
    })
    .then(({ tiles }) => tiles[0]);
  groundTemplate.catch(() => (groundTemplate = null));
  return groundTemplate.then((template) =>
    template.replace("{z}", String(TILE_ZOOM)).replace("{x}", String(col)).replace("{y}", String(row)),
  );
}

function overtureBuildings(): Promise<PMTiles> {
  overture ??= fetch(OVERTURE_CATALOG)
    .then((response) => {
      if (!response.ok) throw new Error(`Overture catalog: HTTP ${response.status}`);
      return response.json() as Promise<{ latest: string }>;
    })
    .then(({ latest }) => new PMTiles(`https://tiles.overturemaps.org/${latest}/buildings.pmtiles`));
  overture.catch(() => (overture = null));
  return overture;
}

async function groundTile(col: number, row: number, signal: AbortSignal): Promise<VectorTile | null> {
  const response = await fetch(await groundUrl(col, row), { signal });
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Ground tile: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.length ? new VectorTile(new PbfReader(bytes)) : null;
}

// ------------------------------------------------------------- geometry --

/** Twice the signed area of a closed path. Positive is counter-clockwise. */
function area2(path: Path): number {
  let sum = 0;
  for (let i = 0, n = path.length; i < n; i += 2) {
    const j = (i + 2) % n;
    sum += path[i] * path[j + 1] - path[j] * path[i + 1];
  }
  return sum;
}

function length(path: Path): number {
  let sum = 0;
  for (let i = 2; i < path.length; i += 2) {
    sum += Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
  }
  return sum;
}

/** Drop repeated points, and the closing point of a ring. */
function tidy(path: Path, closed: boolean, tolerance = 0.05 * M): Path {
  const out: Path = [];
  for (let i = 0; i < path.length; i += 2) {
    const n = out.length;
    if (n && Math.abs(path[i] - out[n - 2]) < tolerance && Math.abs(path[i + 1] - out[n - 1]) < tolerance) {
      continue;
    }
    out.push(path[i], path[i + 1]);
  }
  if (
    closed &&
    out.length > 4 &&
    Math.abs(out[0] - out[out.length - 2]) < tolerance &&
    Math.abs(out[1] - out[out.length - 1]) < tolerance
  ) {
    out.length -= 2;
  }
  return out;
}

/** The point halfway along a line, and the direction of the line there. */
function midpoint(path: Path): [x: number, z: number, angle: number] {
  const half = length(path) / 2;
  let walked = 0;
  for (let i = 2; i < path.length; i += 2) {
    const dx = path[i] - path[i - 2];
    const dz = path[i + 1] - path[i - 1];
    const step = Math.hypot(dx, dz);
    if (walked + step >= half && step > 0) {
      const t = (half - walked) / step;
      return [path[i - 2] + dx * t, path[i - 1] + dz * t, Math.atan2(dz, dx)];
    }
    walked += step;
  }
  return [path[0], path[1], 0];
}

/** A polygon cut into triangles: its points, and three indices for each. */
function triangulate(rings: Path[]): { flat: number[]; triangles: number[] } {
  const flat: number[] = [];
  const holes: number[] = [];
  rings.forEach((ring, k) => {
    if (ring.length < 6) return;
    if (k) holes.push(flat.length / 2);
    for (const value of ring) flat.push(value);
  });
  return { flat, triangles: earcut(flat, holes, 2) };
}

/** Size of a polygon, by its outline. */
function areaOf(rings: Path[]): number {
  return Math.abs(area2(rings[0])) / 2;
}

/** The largest of the polygons of a feature. */
function largest(polygons: Path[][]): { size: number; rings: Path[] } | null {
  let best: { size: number; rings: Path[] } | null = null;
  for (const rings of polygons) {
    const size = areaOf(rings);
    if (!best || size > best.size) best = { size, rings };
  }
  return best;
}

/**
 * Visit points at regular steps along a line: where each is, and the
 * direction of the line there.
 */
function alongPath(
  path: Path,
  first: number,
  step: number,
  visit: (x: number, z: number, dx: number, dz: number) => void,
): void {
  let next = first;
  let walked = 0;
  for (let i = 2; i < path.length; i += 2) {
    const dx = path[i] - path[i - 2];
    const dz = path[i + 1] - path[i - 1];
    const span = Math.hypot(dx, dz);
    while (span > 0 && next <= walked + span) {
      const t = (next - walked) / span;
      visit(path[i - 2] + dx * t, path[i - 1] + dz * t, dx / span, dz / span);
      next += step;
    }
    walked += span;
  }
}

/** A point that is certainly inside a polygon: the middle of its largest triangle. */
function interior(rings: Path[]): [x: number, z: number] | null {
  const { flat, triangles } = triangulate(rings);
  let best = 0;
  let point: [number, number] | null = null;
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i] * 2;
    const b = triangles[i + 1] * 2;
    const c = triangles[i + 2] * 2;
    const size = Math.abs(
      (flat[b] - flat[a]) * (flat[c + 1] - flat[a + 1]) - (flat[c] - flat[a]) * (flat[b + 1] - flat[a + 1]),
    );
    if (size > best) {
      best = size;
      point = [(flat[a] + flat[b] + flat[c]) / 3, (flat[a + 1] + flat[b + 1] + flat[c + 1]) / 3];
    }
  }
  return point;
}

/** Everything that lies flat. Triangles are drawn in the order they are added. */
class Flat {
  private positions: number[] = [];
  private colours: number[] = [];
  private indices: number[] = [];
  private count = 0;

  private vertex(x: number, z: number, colour: RGB, surface: number): void {
    this.positions.push(x, z);
    this.colours.push(colour[0], colour[1], colour[2], surface);
    this.count++;
  }

  polygon(rings: Path[], colour: RGB, surface: number): void {
    const { flat, triangles } = triangulate(rings);
    if (!triangles.length) return;
    const base = this.count;
    for (let i = 0; i < flat.length; i += 2) this.vertex(flat[i], flat[i + 1], colour, surface);
    for (const index of triangles) this.indices.push(base + index);
  }

  /** A line drawn with a width, mitred at the bends. */
  ribbon(line: Path, half: number, colour: RGB, surface: number): void {
    const n = line.length / 2;
    if (n < 2) return;
    const base = this.count;
    for (let i = 0; i < n; i++) {
      const x = line[i * 2];
      const z = line[i * 2 + 1];
      let ax = 0;
      let az = 0;
      let bx = 0;
      let bz = 0;
      if (i > 0) {
        ax = x - line[i * 2 - 2];
        az = z - line[i * 2 - 1];
        const l = Math.hypot(ax, az) || 1;
        ax /= l;
        az /= l;
      }
      if (i < n - 1) {
        bx = line[i * 2 + 2] - x;
        bz = line[i * 2 + 3] - z;
        const l = Math.hypot(bx, bz) || 1;
        bx /= l;
        bz /= l;
      }
      if (i === 0) [ax, az] = [bx, bz];
      if (i === n - 1) [bx, bz] = [ax, az];
      let nx = -(az + bz);
      let nz = ax + bx;
      const l = Math.hypot(nx, nz);
      let reach = half;
      if (l < 1e-6) {
        nx = -az;
        nz = ax;
      } else {
        nx /= l;
        nz /= l;
        // Wider at a bend so the edges stay parallel, within reason.
        reach = half / Math.max(0.5, nx * -az + nz * ax);
      }
      this.vertex(x + nx * reach, z + nz * reach, colour, surface);
      this.vertex(x - nx * reach, z - nz * reach, colour, surface);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      this.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  /** The arrays, with positions as fractions of the tile's side. */
  finish(side: number): GroundMesh | null {
    if (!this.indices.length) return null;
    return {
      positions: Float32Array.from(this.positions, (value) => value / side),
      colours: new Uint8Array(this.colours),
      indices: new Uint32Array(this.indices),
    };
  }
}

/** Everything that stands up. */
class Solid {
  private positions: number[] = [];
  private normals: number[] = [];
  private colours: number[] = [];
  private along: number[] = [];
  private indices: number[] = [];
  private count = 0;

  private vertex(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    colour: RGB,
    windows: number,
    along: number,
  ): void {
    this.positions.push(x, y, z);
    this.normals.push(Math.round(nx * 127), Math.round(ny * 127), Math.round(nz * 127));
    this.colours.push(colour[0], colour[1], colour[2], windows);
    this.along.push(along);
    this.count++;
  }

  /** An upright rectangle from a to b. */
  private wall(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    y0: number,
    y1: number,
    nx: number,
    nz: number,
    colour: RGB,
    windows: number,
    s0: number,
    s1: number,
  ): void {
    const base = this.count;
    this.vertex(ax, y0, az, nx, 0, nz, colour, windows, s0);
    this.vertex(bx, y0, bz, nx, 0, nz, colour, windows, s1);
    this.vertex(bx, y1, bz, nx, 0, nz, colour, windows, s1);
    this.vertex(ax, y1, az, nx, 0, nz, colour, windows, s0);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** A footprint pulled up to a height: walls all round and a flat roof. */
  prism(rings: Path[], height: number, wall: RGB, roof: RGB, windows: number): void {
    rings.forEach((ring, k) => {
      if (ring.length < 6) return;
      // Walls face away from the building: outwards on the outline,
      // into the courtyard on a hole.
      const outward = (area2(ring) > 0 ? 1 : -1) * (k === 0 ? 1 : -1);
      let walked = 0;
      for (let i = 0, n = ring.length; i < n; i += 2) {
        const j = (i + 2) % n;
        const dx = ring[j] - ring[i];
        const dz = ring[j + 1] - ring[i + 1];
        const step = Math.hypot(dx, dz);
        if (step < 1e-7) continue;
        this.wall(
          ring[i],
          ring[i + 1],
          ring[j],
          ring[j + 1],
          0,
          height,
          (dz / step) * outward,
          (-dx / step) * outward,
          wall,
          windows,
          walked / M,
          (walked + step) / M,
        );
        walked += step;
      }
    });
    const { flat, triangles } = triangulate(rings);
    const base = this.count;
    for (let i = 0; i < flat.length; i += 2) this.vertex(flat[i], height, flat[i + 1], 0, 1, 0, roof, 0, 0);
    for (const index of triangles) this.indices.push(base + index);
  }

  /** A box standing on a square, without a bottom. */
  box(cx: number, cz: number, half: number, y0: number, y1: number, colour: RGB): void {
    const x0 = cx - half;
    const x1 = cx + half;
    const z0 = cz - half;
    const z1 = cz + half;
    this.wall(x0, z0, x1, z0, y0, y1, 0, -1, colour, 0, 0, 0);
    this.wall(x1, z0, x1, z1, y0, y1, 1, 0, colour, 0, 0, 0);
    this.wall(x1, z1, x0, z1, y0, y1, 0, 1, colour, 0, 0, 0);
    this.wall(x0, z1, x0, z0, y0, y1, -1, 0, colour, 0, 0, 0);
    const base = this.count;
    this.vertex(x0, y1, z0, 0, 1, 0, colour, 0, 0);
    this.vertex(x1, y1, z0, 0, 1, 0, colour, 0, 0);
    this.vertex(x1, y1, z1, 0, 1, 0, colour, 0, 0);
    this.vertex(x0, y1, z1, 0, 1, 0, colour, 0, 0);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  finish(place: (x: number, z: number) => [number, number]): SolidMesh | null {
    if (!this.indices.length) return null;
    const positions = new Float32Array(this.positions);
    for (let i = 0; i < positions.length; i += 3) {
      [positions[i], positions[i + 2]] = place(positions[i], positions[i + 2]);
    }
    return {
      positions,
      normals: new Int8Array(this.normals),
      colours: new Uint8Array(this.colours),
      along: new Float32Array(this.along),
      indices: new Uint32Array(this.indices),
    };
  }
}

/** A tile's square stand-in, and the way from it to the scene. */
interface Frame {
  corners: Corners;
  /** Side of the square, km. */
  side: number;
  /** Square km from the corner to scene km from the corner. */
  place(x: number, z: number): [number, number];
  inTile(x: number, z: number): boolean;
}

function frameOf(col: number, row: number): Frame {
  const corners = tileCorners(col, row);
  const origin = corners[0];
  const relative: Corners = [
    [0, 0],
    [corners[1][0] - origin[0], corners[1][1] - origin[1]],
    [corners[2][0] - origin[0], corners[2][1] - origin[1]],
    [corners[3][0] - origin[0], corners[3][1] - origin[1]],
  ];
  const side = tileSide(corners);
  return {
    corners,
    side,
    place: (x, z) => warp(relative, x / side, z / side),
    inTile: (x, z) => x >= 0 && x < side && z >= 0 && z < side,
  };
}

// --------------------------------------------------------------- ground --

const { leaves, ...plain } = STREET;
const C = Object.fromEntries(Object.entries(plain).map(([name, colour]) => [name, hex(colour)])) as Record<
  keyof typeof plain,
  RGB
>;
const LEAVES = leaves.map(hex);

function landcoverColour(p: Properties): RGB | null {
  const kind = String(p.class ?? "");
  const sub = String(p.subclass ?? "");
  if (kind === "farmland") return C.field;
  if (kind === "wood" || kind === "forest") return C.wood;
  if (kind === "wetland") return C.wetland;
  if (kind === "sand") return C.sand;
  if (kind === "rock") return C.rock;
  if (kind === "grass") return sub === "scrub" || sub === "heath" ? C.scrub : C.grass;
  return null;
}

function landuseColour(p: Properties): RGB | null {
  const kind = String(p.class ?? "");
  if (/^(residential|suburb|quarter|neighbourhood)$/.test(kind)) return C.built;
  if (/^(commercial|retail|industrial|garages|bus_station|railway)$/.test(kind)) {
    return kind === "railway" ? C.railbed : C.commercial;
  }
  if (kind === "cemetery") return C.cemetery;
  if (/^(school|university|college|kindergarten|hospital)$/.test(kind)) return C.campus;
  if (/^(stadium|pitch|playground|track)$/.test(kind)) return C.pitch;
  if (kind === "quarry") return C.rock;
  return null;
}

/** Half the width of a road in metres, and how high up the pile it is drawn. */
const ROADS: Record<string, [half: number, rank: number]> = {
  motorway: [7.5, 49],
  trunk: [6.5, 48],
  primary: [6, 47],
  secondary: [5, 46],
  tertiary: [4.2, 45],
  busway: [4, 45],
  minor: [3.2, 44],
  service: [2.2, 43],
  track: [1.8, 41],
  path: [0.9, 40],
};

function roadColour(kind: string, p: Properties): RGB {
  // Most side streets in Nigeria are laterite, red earth, where they are not tarred.
  if (kind === "track" || (p.surface === "unpaved" && (kind === "minor" || kind === "service"))) {
    return C.laterite;
  }
  if (kind === "path") return C.path;
  if (kind === "busway") return C.primary;
  return C[kind as "motorway"] ?? C.minor;
}

/** Where something keeps to on a route (km from the centre line), and how busy it is. */
type RouteStyle = [offset: number, weight: number] | null;

/** A road in use at ground level, by its class, or null. */
function roadOf(p: Properties): string | null {
  const kind = String(p.class ?? "");
  if (p.brunnel === "tunnel" || !(kind in ROADS)) return null;
  return kind;
}

const FOOT = /^(footway|pedestrian|path|steps)$/;

/** People walk everywhere: the middle of a footpath, and the edge of every road. */
function walkStyle(p: Properties): RouteStyle {
  const kind = roadOf(p);
  if (!kind || kind === "motorway" || kind === "busway") return null;
  if (kind === "path") return FOOT.test(String(p.subclass ?? "")) ? [0.4 * M, 2.2] : null;
  const edge = ROADS[kind][0];
  if (kind === "minor") return [(edge + 1) * M, 1];
  if (kind === "service" || kind === "track") return [(edge + 0.6) * M, 0.6];
  if (kind === "tertiary") return [(edge + 1.4) * M, 0.8];
  return [(edge + 1.8) * M, 0.55];
}

/** Okadas and kekes keep near the kerb, between the cars and the walkers. */
function rideStyle(p: Properties): RouteStyle {
  const kind = roadOf(p);
  if (!kind || kind === "motorway" || kind === "path" || kind === "busway") return null;
  const edge = ROADS[kind][0];
  if (kind === "minor") return [edge * 0.55 * M, 1.3];
  if (kind === "service" || kind === "track") return [edge * 0.4 * M, 0.5];
  if (kind === "tertiary" || kind === "secondary") return [edge * 0.65 * M, 1.2];
  return [edge * 0.75 * M, 0.8];
}

/** Cars drive in their lane on every road that takes them. */
function driveStyle(p: Properties): RouteStyle {
  const kind = roadOf(p);
  if (!kind || kind === "path" || kind === "track") return null;
  const half = ROADS[kind][0];
  if (kind === "motorway" || kind === "trunk") return [half * 0.4 * M, 1.4];
  if (kind === "primary" || kind === "busway") return [half * 0.35 * M, 1.2];
  if (kind === "secondary" || kind === "tertiary") return [half * 0.35 * M, 1];
  if (kind === "minor") return [1.1 * M, 0.7];
  return [0.9 * M, 0.25];
}

/** Trains run on the main lines and the metro, at ground level and on bridges. */
function railStyle(p: Properties): RouteStyle {
  const kind = String(p.class ?? "");
  if ((kind !== "rail" && kind !== "transit") || p.brunnel === "tunnel") return null;
  // Sidings and yards are where trains stand, not where they run.
  if (p.service) return null;
  return [0, kind === "transit" ? 0.8 : 1.2];
}

/** Which centre lines each kind of traffic follows, and the shortest worth having. */
const ROUTES: Record<MoverKey, [style: (p: Properties) => RouteStyle, minLength: number]> = {
  walks: [walkStyle, 4 * M],
  rides: [rideStyle, 8 * M],
  drives: [driveStyle, 10 * M],
  rails: [railStyle, 20 * M],
};

/**
 * Street lamps stand along the larger tarred roads; most side streets have
 * none. How far from the centre line (km), and how far apart.
 */
function lampStyle(p: Properties): [offset: number, spacing: number] | null {
  const kind = roadOf(p);
  if (!kind || p.surface === "unpaved") return null;
  const edge = (ROADS[kind][0] + 0.8) * M;
  if (kind === "motorway" || kind === "trunk" || kind === "primary") return [edge, 40 * M];
  if (kind === "secondary" || kind === "tertiary") return [edge, 45 * M];
  if (kind === "minor" && p.surface === "paved") return [edge, 55 * M];
  return null;
}
/** More than this in one tile would be a forest of posts. */
const MAX_LAMPS = 900;

/**
 * Trees per square kilometre by what the ground is. Savanna villages and
 * farms are dotted with shade trees; OSM maps little land cover in Nigeria,
 * so open ground away from the cities gets a few too.
 */
const TREES_PER_KM2 = { wood: 2400, park: 1300, grass: 300, field: 90, open: 120 } as const;

/** The name to show: the English or Latin-script one where OSM has it. */
function nameOf(p: Properties): string {
  return String(p["name:en"] ?? p["name:latin"] ?? p.name ?? "").trim();
}

type Visit = (p: Properties, feature: VectorTileFeature, paths: () => Path[]) => void;

interface Item {
  order: number;
  draw: () => void;
}

const EMPTY_ROUTES: Record<MoverKey, RouteLines | null> = {
  walks: null,
  rides: null,
  drives: null,
  rails: null,
};

async function buildGround(
  request: StreetRequest,
  signal: AbortSignal,
): Promise<Extract<StreetResponse, { part: "ground" }>> {
  const tile = await groundTile(request.col, request.row, signal);
  const frame = frameOf(request.col, request.row);
  const S = frame.side;
  const flat = new Flat();
  const trees = new Solid();
  const labels: StreetLabel[] = [];
  const items: Item[] = [];
  const { inTile } = frame;
  const urban = request.density > 2500;

  // Ground with nothing mapped on it: built-up in a town, savanna outside.
  // A little beyond the edge; the shader trims every tile to its own square.
  const pad = 0.02 * S;
  flat.polygon(
    [[-pad, -pad, S + pad, -pad, S + pad, S + pad, -pad, S + pad]],
    urban ? C.built : C.other,
    SURFACE.plain,
  );
  if (!tile) {
    return {
      id: 0,
      ok: true,
      part: "ground",
      ground: flat.finish(S),
      trees: null,
      labels,
      routes: EMPTY_ROUTES,
      lamps: null,
    };
  }

  /** Visit a layer. Geometry arrives already converted to km. */
  const each = (name: string, visit: Visit) => {
    const layer = tile.layers[name];
    if (!layer) return;
    const k = S / layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      visit(feature.properties, feature, () =>
        feature.loadGeometry().map((points) => {
          const path: Path = [];
          for (const point of points) path.push(point.x * k, point.y * k);
          return path;
        }),
      );
    }
  };
  /** The polygons of a feature, each as an outline followed by its holes. */
  const polygonsOf = (feature: VectorTileFeature, extent: number): Path[][] => {
    const k = S / extent;
    return classifyRings(feature.loadGeometry()).map((rings) =>
      rings.map((points) => {
        const path: Path = [];
        for (const point of points) path.push(point.x * k, point.y * k);
        return tidy(path, true);
      }),
    );
  };
  /** Things under a bridge are drawn before the bridge. */
  const order = (p: Properties, rank: number) =>
    (p.brunnel === "bridge" ? 100 : 0) + (Number(p.layer) || 0) * 100 + rank;
  const fill = (
    name: string,
    style: (p: Properties) => [RGB, number, number] | null,
    also?: (polygons: Path[][], p: Properties) => void,
  ) => {
    const layer = tile.layers[name];
    if (!layer) return;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      if (feature.type !== 3) continue;
      const styled = style(feature.properties);
      if (!styled) continue;
      const [colour, rank, surface] = styled;
      const polygons = polygonsOf(feature, layer.extent);
      also?.(polygons, feature.properties);
      items.push({
        order: order(feature.properties, rank),
        draw: () => polygons.forEach((rings) => flat.polygon(rings, colour, surface)),
      });
    }
  };
  const stroke = (name: string, style: (p: Properties) => [RGB, number, number, number] | null) => {
    each(name, (p, feature, paths) => {
      if (feature.type !== 2) return;
      const styled = style(p);
      if (!styled) return;
      const [colour, rank, surface, half] = styled;
      const lines = paths().map((path) => tidy(path, false));
      items.push({
        order: order(p, rank),
        draw: () => lines.forEach((line) => flat.ribbon(line, half, colour, surface)),
      });
    });
  };

  // ---- trees, planted at random but the same way every time
  const treeCap = request.lite ? 500 : 1400;
  let planted = 0;
  const plant = (x: number, z: number) => {
    if (planted >= treeCap || !inTile(x, z)) return;
    const seed = Math.round(x * 1e6) * 7919 + Math.round(z * 1e6);
    const crown = (2.2 + 1.6 * hash(seed)) * M;
    const top = (6 + 6 * hash(seed + 1)) * M;
    trees.box(x, z, 0.3 * M, 0, 3 * M, C.trunkWood);
    trees.box(x, z, crown, 2.6 * M, top, LEAVES[Math.floor(hash(seed + 2) * LEAVES.length)]);
    planted++;
  };
  const scatter = (polygons: Path[][], perKm2: number) => {
    for (const rings of polygons) {
      const { flat: points, triangles } = triangulate(rings);
      for (let i = 0; i < triangles.length; i += 3) {
        const a = triangles[i] * 2;
        const b = triangles[i + 1] * 2;
        const c = triangles[i + 2] * 2;
        const size =
          Math.abs(
            (points[b] - points[a]) * (points[c + 1] - points[a + 1]) -
              (points[c] - points[a]) * (points[b + 1] - points[a + 1]),
          ) / 2;
        const seed = Math.round(points[a] * 1e5) * 31 + Math.round(points[a + 1] * 1e5);
        const expected = size * perKm2;
        const count = Math.floor(expected) + (hash(seed) < expected % 1 ? 1 : 0);
        for (let k = 0; k < count; k++) {
          let r1 = hash(seed + k * 2 + 1);
          let r2 = hash(seed + k * 2 + 2);
          if (r1 + r2 > 1) [r1, r2] = [1 - r1, 1 - r2];
          plant(
            points[a] + (points[b] - points[a]) * r1 + (points[c] - points[a]) * r2,
            points[a + 1] + (points[b + 1] - points[a + 1]) * r1 + (points[c + 1] - points[a + 1]) * r2,
          );
        }
      }
    }
  };
  const forest: Path[][] = [];
  const parks: Path[][] = [];
  const meadows: Path[][] = [];
  const fields: Path[][] = [];

  // ---- what lies on the ground
  fill(
    "landcover",
    (p) => {
      const colour = landcoverColour(p);
      return colour ? [colour, 10, SURFACE.plain] : null;
    },
    (polygons, p) => {
      const kind = String(p.class ?? "");
      if (kind === "wood" || kind === "forest") forest.push(...polygons);
      else if (kind === "grass") meadows.push(...polygons);
      else if (kind === "farmland") fields.push(...polygons);
    },
  );
  fill("landuse", (p) => {
    const colour = landuseColour(p);
    return colour ? [colour, 11, SURFACE.plain] : null;
  });
  fill(
    "park",
    (p) => (p.class === "park" ? [C.grass, 12, SURFACE.plain] : null),
    (polygons, p) => {
      if (p.class === "park") parks.push(...polygons);
    },
  );
  fill("aeroway", (p) => (p.class === "aerodrome" ? null : [C.apron, 18, SURFACE.plain]));
  stroke("aeroway", (p) =>
    p.class === "runway"
      ? [C.runway, 19, SURFACE.plain, 22 * M]
      : p.class === "taxiway"
        ? [C.runway, 19, SURFACE.plain, 7 * M]
        : null,
  );
  fill("water", (p) =>
    p.brunnel === "tunnel" ? null : [p.class === "ocean" ? C.sea : C.water, 20, SURFACE.water],
  );
  stroke("waterway", (p) => {
    if (p.brunnel === "tunnel") return null;
    const kind = String(p.class ?? "");
    const half = kind === "river" ? 6 : kind === "canal" ? 4 : kind === "stream" ? 1.5 : 1;
    return [C.water, 21, SURFACE.water, half * M];
  });
  fill("transportation", (p) => (p.class === "pier" ? [C.jetty, 30, SURFACE.plain] : null));
  stroke("transportation", (p) => {
    const kind = roadOf(p);
    if (!kind) return null;
    const [half, rank] = ROADS[kind];
    return [roadColour(kind, p), rank, SURFACE.road, half * M];
  });
  stroke("transportation", (p) => {
    const kind = String(p.class ?? "");
    if ((kind !== "rail" && kind !== "transit") || p.brunnel === "tunnel") return null;
    return [kind === "transit" ? C.transit : C.rail, 55, SURFACE.plain, (kind === "transit" ? 1.2 : 1.5) * M];
  });

  items.sort((a, b) => a.order - b.order);
  for (const item of items) item.draw();

  scatter(forest, TREES_PER_KM2.wood);
  scatter(parks, TREES_PER_KM2.park);
  scatter(meadows, TREES_PER_KM2.grass);
  scatter(fields, TREES_PER_KM2.field);
  if (!urban) scatter([[[0, 0, S, 0, S, S, 0, S]]], TREES_PER_KM2.open);

  // ---- names. Streets: one name per street, on its longest stretch.
  const streets = new Map<
    string,
    { total: number; longest: number; at: [number, number, number]; base: number; reach: number }
  >();
  each("transportation_name", (p, feature, paths) => {
    const name = nameOf(p);
    if (feature.type !== 2 || !name) return;
    const kind = String(p.class ?? "");
    const [base, reach] =
      kind === "motorway" || kind === "trunk" || kind === "primary"
        ? [20, 2.6]
        : kind === "secondary" || kind === "tertiary"
          ? [20.5, 2]
          : kind === "minor"
            ? [21, 1.4]
            : [22, 0.8];
    for (const path of paths()) {
      const size = length(path);
      const at = midpoint(path);
      let entry = streets.get(name);
      if (!entry) {
        entry = { total: 0, longest: 0, at, base, reach };
        streets.set(name, entry);
      }
      entry.total += size;
      entry.base = Math.min(entry.base, base);
      entry.reach = Math.max(entry.reach, reach);
      if (size > entry.longest && inTile(at[0], at[1])) {
        entry.longest = size;
        entry.at = at;
      }
    }
  });
  const named: StreetLabel[] = [];
  for (const [text, street] of streets) {
    // A stretch shorter than its own name has no room for it.
    if (street.longest < 0.03) continue;
    named.push({
      text,
      kind: "street",
      x: street.at[0],
      z: street.at[1],
      angle: street.at[2],
      rank: street.base - Math.min(0.45, street.total / 2),
      reach: street.reach,
    });
  }
  named.sort((a, b) => a.rank - b.rank);
  labels.push(...named.slice(0, 48));

  // Water: lagoons, lakes and rivers are named at a point or along a line.
  each("water_name", (p, feature, paths) => {
    const text = nameOf(p);
    if (!text) return;
    const path = paths()[0];
    const [x, z] = path;
    const large = p.class === "lake" || p.class === "ocean" || p.class === "bay";
    const label: StreetLabel = { text, kind: "canal", x, z, rank: large ? 19 : 22, reach: large ? 4.4 : 2.2 };
    if (feature.type === 2) [label.x, label.z, label.angle] = midpoint(path);
    if (inTile(label.x, label.z)) labels.push(label);
  });

  // Districts, neighbourhoods and villages.
  each("place", (p, feature, paths) => {
    const text = nameOf(p);
    const kind = String(p.class ?? "");
    if (feature.type !== 1 || !text || kind === "city" || kind === "state" || kind === "country") return;
    const [x, z] = paths()[0];
    if (!inTile(x, z)) return;
    const big = kind === "suburb" || kind === "town" || kind === "island";
    labels.push({ text, kind: "hood", x, z, rank: big ? 18.5 : 19.5, reach: big ? 4.4 : 2.4 });
  });

  // Airports.
  each("aerodrome_label", (p, feature, paths) => {
    const text = nameOf(p);
    if (feature.type !== 1 || !text) return;
    const [x, z] = paths()[0];
    if (inTile(x, z)) labels.push({ text, kind: "station", x, z, rank: 11, reach: 4.4 });
  });

  // Places people look for: stations, campuses, hospitals, markets,
  // mosques and churches. A university is named once in a tile.
  const campuses = new Set<string>();
  each("poi", (p, feature, paths) => {
    const text = nameOf(p);
    if (feature.type !== 1 || !text) return;
    const [x, z] = paths()[0];
    if (!inTile(x, z)) return;
    const kind = String(p.class ?? "");
    const sub = String(p.subclass ?? "");
    const add = (labelKind: StreetLabel["kind"], rank: number, reach: number) =>
      labels.push({
        text,
        kind: labelKind,
        x,
        z,
        rank: rank + Math.min(0.9, (Number(p.rank) || 1) / 40),
        reach,
      });
    if (kind === "railway" && (sub === "station" || sub === "halt")) add("station", 12, 4.4);
    else if (kind === "railway") add("station", 14, 2.4);
    else if (kind === "bus" && sub === "bus_station") add("station", 14.5, 2.4);
    else if ((kind === "college" || kind === "school") && (sub === "university" || sub === "college")) {
      if (campuses.has(text)) return;
      campuses.add(text);
      add("campus", 13, 3.4);
    } else if (kind === "town_hall" && sub === "townhall") add("civic", 10, 4.4);
    else if (kind === "hospital" && sub === "hospital") add("building", 15, 3);
    else if (sub === "marketplace") add("building", 15.5, 3);
    else if (/^(museum|stadium|monument|castle|attraction|art_gallery|theatre)$/.test(kind))
      add("building", 16, 2.4);
    else if (kind === "place_of_worship") add("building", 22, 1.4);
  });

  // Named parks and gardens.
  const parkLayer = tile.layers.park;
  if (parkLayer) {
    for (let i = 0; i < parkLayer.length; i++) {
      const feature = parkLayer.feature(i);
      const text = nameOf(feature.properties);
      if (feature.type !== 3 || !text) continue;
      const best = largest(polygonsOf(feature, parkLayer.extent));
      if (!best || best.size < 0.0015) continue;
      const at = interior(best.rings);
      if (!at || !inTile(at[0], at[1])) continue;
      labels.push({
        text,
        kind: "area",
        x: at[0],
        z: at[1],
        rank: 19.1 - Math.min(0.3, best.size),
        reach: 2.6,
      });
    }
  }

  // ---- where people walk, okadas ride, cars drive and trains run
  const routes = Object.fromEntries(
    Object.entries(ROUTES).map(([kind, [style, minLength]]) => {
      const out: number[] = [];
      each("transportation", (p, feature, paths) => {
        const styled = feature.type === 2 ? style(p) : null;
        if (!styled) return;
        for (const path of paths()) {
          const line = tidy(path, false, 0.3 * M);
          if (line.length < 4 || length(line) < minLength) continue;
          const middle = midpoint(line);
          if (!inTile(middle[0], middle[1])) continue;
          out.push(line.length / 2, ...styled);
          for (let i = 0; i < line.length; i += 2) out.push(...frame.place(line[i], line[i + 1]));
        }
      });
      return [kind, out.length ? new Float32Array(out) : null];
    }),
  ) as Record<MoverKey, RouteLines | null>;

  // ---- street lamps: down one side of the road, the arm over it
  const lamps: number[] = [];
  let road = 0;
  each("transportation", (p, feature, paths) => {
    const styled = feature.type === 2 ? lampStyle(p) : null;
    if (!styled) return;
    const [offset, spacing] = styled;
    const side = hash(road++) < 0.5 ? 1 : -1;
    for (const path of paths()) {
      alongPath(path, spacing / 2, spacing, (x, z, dx, dz) => {
        const lx = x - dz * offset * side;
        const lz = z + dx * offset * side;
        if (lamps.length < MAX_LAMPS * 3 && inTile(lx, lz)) {
          lamps.push(...frame.place(lx, lz), Math.atan2(dz * side, -dx * side));
        }
      });
    }
  });

  for (const label of labels) [label.x, label.z] = frame.place(label.x, label.z);

  return {
    id: 0,
    ok: true,
    part: "ground",
    ground: flat.finish(S),
    trees: trees.finish(frame.place),
    labels,
    routes,
    lamps: lamps.length ? new Float32Array(lamps) : null,
  };
}

// ------------------------------------------------------------ buildings --

const BANDS = BUILDING_BANDS.map((band) => ({ below: band.below, walls: band.walls.map(hex) }));
const SHEET = ROOFS.sheet.map(hex);
const FLAT_ROOF = ROOFS.flat.map(hex);
const STOREY = 3.2;

/** Buildings drawn per tile at most, largest first: Kano alone has 34,000 in one. */
const MOST_BUILDINGS = { full: 14000, lite: 4500 };

interface Footprint {
  rings: Path[];
  /** Square metres. */
  area: number;
  p: Properties;
  seed: number;
}

/** A number from a string, the same every time. */
function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shadeOf(colour: RGB, amount: number): RGB {
  const shade = (value: number) => Math.min(255, Math.round(value * amount));
  return [shade(colour[0]), shade(colour[1]), shade(colour[2])];
}

/** Floors for a building the data gives no height for. */
function guessFloors(area: number, density: number, r: number): number {
  if (density < 1500) return area > 250 && r < 0.2 ? 2 : 1;
  if (density < 8000) {
    if (area > 600 && r < 0.3) return 3;
    return r < (area > 150 ? 0.45 : 0.15) ? 2 : 1;
  }
  return 1 + Math.floor(r * (area > 300 ? 4 : area > 80 ? 3 : 2));
}

/**
 * Height in metres. A measured height or a count of floors where the data
 * has one. Otherwise a guess, the same for a building every time, from its
 * footprint and how many people live around it: one storey in the
 * countryside, two or three in a town, more in the densest districts, and
 * tall single halls for the largest footprints.
 */
function heightOf(b: Footprint, density: number): number {
  const measured = Number(b.p.height) || Number(b.p.render_height);
  if (measured > 0) return measured;
  const floors = Number(b.p.num_floors);
  if (floors > 0) return floors * STOREY + 0.8;
  const r = hash(b.seed);
  // Markets, halls and warehouses: one tall storey.
  if (b.area > 3000) return (r < 0.3 ? 12 : 8) + 2 * hash(b.seed + 1);
  return guessFloors(b.area, density, r) * STOREY + 0.6;
}

async function buildingFootprints(
  request: StreetRequest,
  side: number,
  signal: AbortSignal,
): Promise<{ footprints: Footprint[]; source: "overture" | "osm" }> {
  let tile: VectorTile | null = null;
  let source: "overture" | "osm" = "overture";
  try {
    const archive = await overtureBuildings();
    const bytes = await archive.tile(TILE_ZOOM, request.col, request.row, signal);
    tile = bytes ? new VectorTile(new PbfReader(bytes)) : null;
  } catch (error) {
    if (signal.aborted) throw error;
    // Overture out of reach: OSM's own footprints from the ground tile,
    // which the browser has cached already. Far fewer outside Lagos.
    source = "osm";
    tile = await groundTile(request.col, request.row, signal);
  }
  const layer = tile?.layers.building;
  const footprints: Footprint[] = [];
  if (!layer) return { footprints, source };
  const k = side / layer.extent;
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    if (feature.type !== 3 || feature.properties.is_underground === true) continue;
    // OpenFreeMap merges buildings of one height into a single feature:
    // each outer ring is a building of its own.
    for (const polygon of classifyRings(feature.loadGeometry())) {
      const rings = polygon.map((points) => {
        const path: Path = [];
        for (const point of points) path.push(point.x * k, point.y * k);
        return tidy(path, true, 0.1 * M);
      });
      if (rings[0].length < 6) continue;
      const area = areaOf(rings) / (M * M);
      // Sheds and kiosks, and slivers cut off at the tile's edge.
      if (area < 12) continue;
      const id = String(feature.properties.id ?? `${rings[0][0]},${rings[0][1]}`);
      footprints.push({ rings, area, p: feature.properties, seed: seedOf(id) });
    }
  }
  const most = request.lite ? MOST_BUILDINGS.lite : MOST_BUILDINGS.full;
  if (footprints.length > most) footprints.sort((a, b) => b.area - a.area).length = most;
  return { footprints, source };
}

async function buildBuildings(
  request: StreetRequest,
  signal: AbortSignal,
): Promise<Extract<StreetResponse, { part: "buildings" }>> {
  const frame = frameOf(request.col, request.row);
  const { footprints, source } = await buildingFootprints(request, frame.side, signal);
  const solid = new Solid();
  for (const b of footprints) {
    const height = Math.min(330, Math.max(2.6, heightOf(b, request.density)));
    const floors = Math.max(1, Math.round(height / STOREY));
    const band = BANDS.find((entry) => floors < entry.below) ?? BANDS[BANDS.length - 1];
    const wall = shadeOf(band.walls[b.seed % band.walls.length], 0.94 + 0.12 * hash(b.seed + 3));
    // Houses and small blocks have sheet roofs; larger and taller ones are flat concrete.
    const roofs = b.area < 600 && floors <= 2 ? SHEET : FLAT_ROOF;
    const roof = roofs[(b.seed >>> 8) % roofs.length];
    solid.prism(b.rings, height * M, wall, roof, 1 + (b.seed % 254));
  }
  return { id: 0, ok: true, part: "buildings", buildings: solid.finish(frame.place), source };
}

// ------------------------------------------------------------- messages --

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: StreetResponse, transfer: Transferable[]): void;
};
const running = new Map<number, AbortController>();

/** The memory behind a set of arrays, to hand over rather than copy. */
function buffers(arrays: object | null): Transferable[] {
  return Object.values(arrays ?? {})
    .filter((array) => array !== null && typeof array === "object")
    .map((array) => (array as Float32Array).buffer);
}

scope.onmessage = async (event) => {
  const message = event.data as StreetRequest | { cancel: number };
  if ("cancel" in message) {
    running.get(message.cancel)?.abort();
    return;
  }
  const control = new AbortController();
  running.set(message.id, control);
  try {
    if (message.part === "ground") {
      const result = await buildGround(message, control.signal);
      result.id = message.id;
      scope.postMessage(result, [
        ...buffers(result.ground),
        ...buffers(result.trees),
        ...buffers(result.routes),
        ...buffers({ lamps: result.lamps }),
      ]);
    } else {
      const result = await buildBuildings(message, control.signal);
      result.id = message.id;
      scope.postMessage(result, buffers(result.buildings));
    }
  } catch (error) {
    scope.postMessage(
      { id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) },
      [],
    );
  } finally {
    running.delete(message.id);
  }
};
