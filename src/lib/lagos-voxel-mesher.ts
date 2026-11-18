import * as THREE from "three";

export interface LagosGridData {
  gridW: number;
  gridH: number;
  cellM: number;
  vStepM: number;
  halfWM: number;
  halfHM: number;
  centerLat: number;
  centerLon: number;
  palette: string[];
  surface: Uint8Array;
  bHeight: Uint8Array;
  bColor: Uint8Array;
  bridgeH: Uint8Array;
  treeH: Uint8Array;
}

export interface RouteLine {
  name: string;
  kind: string;
  len?: number;
  pts: [number, number, number][];
}

export interface OsmPoi {
  id: number;
  name: string;
  lat: number;
  lon: number;
  kind: string;
}

/** Midpoint of a walk route polyline in world meters → approximate lat/lon */
export function routeMidLatLon(
  route: RouteLine,
  centerLat: number,
  centerLon: number
): { lat: number; lon: number } {
  const mid = route.pts[Math.floor(route.pts.length / 2)] || route.pts[0];
  if (!mid) return { lat: centerLat, lon: centerLon };
  const mPerLat = 110574;
  const mPerLon = 111320 * Math.cos((centerLat * Math.PI) / 180);
  return {
    lat: centerLat - mid[2] / mPerLat,
    lon: centerLon + mid[0] / mPerLon,
  };
}

export interface LagosMeta {
  gridW: number;
  gridH: number;
  cellM: number;
  vStepM: number;
  halfWM: number;
  halfHM: number;
  centerLat: number;
  centerLon: number;
  palette: string[];
  stats: {
    buildings: number;
    tallBuildings?: number;
    roads: number;
    parks: number;
    walkRoutes?: number;
    stops?: number;
  };
  pois?: OsmPoi[];
  /** Arterial / ferry polylines for vehicle traffic */
  routes: RouteLine[];
  /** Named OSM streets for walk / street-view snap / search */
  walkRoutes?: RouteLine[];
  /** Bus stops, stations, ferry terminals from OSM */
  stops?: OsmPoi[];
}

export const CHUNK_CELLS = 44; // 1320/44 = 30 cols, 880/44 = 20 rows

export function latLonToWorldMeters(
  lat: number,
  lon: number,
  centerLat = 6.442,
  centerLon = 3.42
): [number, number] {
  const mPerLat = 110574;
  const mPerLon = 111320 * Math.cos((centerLat * Math.PI) / 180);
  return [(lon - centerLon) * mPerLon, -(lat - centerLat) * mPerLat];
}

/** The bytes of a world .bin, unzipped. The files are gzipped at build time; older plain ones pass through. */
export async function readWorldBinary(response: Response): Promise<ArrayBuffer> {
  if (!response.ok) throw new Error(`World grid: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const head = new Uint8Array(bytes, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export function parseLagosBinary(buffer: ArrayBuffer, meta: LagosMeta): LagosGridData {
  const view = new DataView(buffer);
  const gridW = view.getUint16(4, true);
  const gridH = view.getUint16(6, true);
  const cellM = view.getUint16(8, true);
  const vStepM = view.getUint16(10, true);
  const total = gridW * gridH;

  const bytes = new Uint8Array(buffer, 16);
  const surface = new Uint8Array(total);
  const bHeight = new Uint8Array(total);
  const bColor = new Uint8Array(total);
  const bridgeH = new Uint8Array(total);
  const treeH = new Uint8Array(total);

  for (let i = 0; i < total; i++) {
    const off = i * 4;
    surface[i] = bytes[off];
    bHeight[i] = bytes[off + 1];
    bColor[i] = bytes[off + 2];
    const packed = bytes[off + 3];
    bridgeH[i] = (packed >> 4) & 0x0f;
    treeH[i] = packed & 0x0f;
  }

  return {
    gridW,
    gridH,
    cellM,
    vStepM,
    halfWM: meta.halfWM,
    halfHM: meta.halfHM,
    centerLat: meta.centerLat,
    centerLon: meta.centerLon,
    palette: meta.palette,
    surface,
    bHeight,
    bColor,
    bridgeH,
    treeH,
  };
}

function hexToRgbNorm(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Surface base colors: [1=land, 2=grass, 3=road, 4=arterial, 5=sand]
const SURFACE_COLORS: Record<number, [number, number, number]> = {
  1: [0.24, 0.24, 0.23], // warm urban ground
  2: [0.19, 0.42, 0.24], // tropical park / Ikoyi golf green
  3: [0.16, 0.17, 0.2],  // street asphalt
  4: [0.13, 0.14, 0.17], // major arterial / expressway
  5: [0.68, 0.61, 0.47], // coastal sand / Eko Atlantic seawall
};

function hashCell(gx: number, gz: number): number {
  const h = ((gx * 374761393 + gz * 668265263) ^ 0x5bf03635) >>> 0;
  return (h % 1000) / 1000;
}

export function buildChunkGeometry(
  grid: LagosGridData,
  cx: number,
  cz: number,
  paletteRgb: [number, number, number][]
): THREE.BufferGeometry | null {
  const { gridW, gridH, cellM, vStepM, halfWM, halfHM, surface, bHeight, bColor, bridgeH, treeH } =
    grid;

  const startX = cx * CHUNK_CELLS;
  const startZ = cz * CHUNK_CELLS;
  const endX = Math.min(gridW, startX + CHUNK_CELLS);
  const endZ = Math.min(gridH, startZ + CHUNK_CELLS);

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const glows: number[] = [];
  const indices: number[] = [];

  let vCount = 0;

  function pushQuad(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    x3: number, y3: number, z3: number,
    nx: number, ny: number, nz: number,
    r: number, g: number, b: number,
    gr: number, gg: number, gb: number
  ) {
    positions.push(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    colors.push(r, g, b, r, g, b, r, g, b, r, g, b);
    glows.push(gr, gg, gb, gr, gg, gb, gr, gg, gb, gr, gg, gb);
    indices.push(vCount, vCount + 1, vCount + 2, vCount, vCount + 2, vCount + 3);
    vCount += 4;
  }

  function pushBox(
    wx0: number, wy0: number, wz0: number,
    wx1: number, wy1: number, wz1: number,
    r: number, g: number, b: number,
    topMult = 1.06,
    sideShade = 0.88,
    glow: [number, number, number] = [0, 0, 0],
    emitBottom = false
  ) {
    const tr = Math.min(1, r * topMult);
    const tg = Math.min(1, g * topMult);
    const tb = Math.min(1, b * topMult);
    // Top (+Y)
    pushQuad(
      wx0, wy1, wz1,
      wx1, wy1, wz1,
      wx1, wy1, wz0,
      wx0, wy1, wz0,
      0, 1, 0,
      tr, tg, tb,
      0, 0, 0
    );
    if (emitBottom) {
      pushQuad(
        wx0, wy0, wz0,
        wx1, wy0, wz0,
        wx1, wy0, wz1,
        wx0, wy0, wz1,
        0, -1, 0,
        r * 0.6, g * 0.6, b * 0.6,
        0, 0, 0
      );
    }
    // North (-Z)
    pushQuad(
      wx1, wy0, wz0,
      wx0, wy0, wz0,
      wx0, wy1, wz0,
      wx1, wy1, wz0,
      0, 0, -1,
      r * sideShade, g * sideShade, b * sideShade,
      glow[0], glow[1], glow[2]
    );
    // South (+Z)
    pushQuad(
      wx0, wy0, wz1,
      wx1, wy0, wz1,
      wx1, wy1, wz1,
      wx0, wy1, wz1,
      0, 0, 1,
      r * 0.94, g * 0.94, b * 0.94,
      glow[0], glow[1], glow[2]
    );
    // West (-X)
    pushQuad(
      wx0, wy0, wz0,
      wx0, wy0, wz1,
      wx0, wy1, wz1,
      wx0, wy1, wz0,
      -1, 0, 0,
      r * 0.82, g * 0.82, b * 0.82,
      glow[0], glow[1], glow[2]
    );
    // East (+X)
    pushQuad(
      wx1, wy0, wz1,
      wx1, wy0, wz0,
      wx1, wy1, wz0,
      wx1, wy1, wz1,
      1, 0, 0,
      r * 0.9, g * 0.9, b * 0.9,
      glow[0], glow[1], glow[2]
    );
  }

  const landTopY = 1.6;
  const idx = (x: number, z: number) => z * gridW + x;

  for (let gz = startZ; gz < endZ; gz++) {
    const wz0 = gz * cellM - halfHM;
    const wz1 = wz0 + cellM;

    for (let gx = startX; gx < endX; gx++) {
      const i = idx(gx, gz);
      const s = surface[i];
      const bh = bHeight[i];
      const br = bridgeH[i];
      const th = treeH[i];

      if (s === 0 && bh === 0 && br === 0 && th === 0) continue;

      const wx0 = gx * cellM - halfWM;
      const wx1 = wx0 + cellM;
      const jitter = (hashCell(gx, gz) - 0.5) * 0.04;

      // 1. Ground cell + shoreline embankments
      if (s !== 0) {
        const base = SURFACE_COLORS[s] || SURFACE_COLORS[1];
        const r = Math.max(0, Math.min(1, base[0] + jitter));
        const g = Math.max(0, Math.min(1, base[1] + jitter));
        const b = Math.max(0, Math.min(1, base[2] + jitter));

        // Top ground quad
        pushQuad(
          wx0, landTopY, wz1,
          wx1, landTopY, wz1,
          wx1, landTopY, wz0,
          wx0, landTopY, wz0,
          0, 1, 0,
          r, g, b,
          s === 4 && hashCell(gx * 3, gz * 7) > 0.86 ? 0.65 : 0,
          s === 4 && hashCell(gx * 3, gz * 7) > 0.86 ? 0.48 : 0,
          s === 4 && hashCell(gx * 3, gz * 7) > 0.86 ? 0.2 : 0
        );

        // Side cliffs only where bordering water
        const nWater = gz > 0 ? surface[idx(gx, gz - 1)] === 0 : true;
        const sWater = gz < gridH - 1 ? surface[idx(gx, gz + 1)] === 0 : true;
        const wWater = gx > 0 ? surface[idx(gx - 1, gz)] === 0 : true;
        const eWater = gx < gridW - 1 ? surface[idx(gx + 1, gz)] === 0 : true;

        if (nWater) {
          pushQuad(wx1, 0, wz0, wx0, 0, wz0, wx0, landTopY, wz0, wx1, landTopY, wz0, 0, 0, -1, r * 0.72, g * 0.72, b * 0.72, 0, 0, 0);
        }
        if (sWater) {
          pushQuad(wx0, 0, wz1, wx1, 0, wz1, wx1, landTopY, wz1, wx0, landTopY, wz1, 0, 0, 1, r * 0.82, g * 0.82, b * 0.82, 0, 0, 0);
        }
        if (wWater) {
          pushQuad(wx0, 0, wz0, wx0, 0, wz1, wx0, landTopY, wz1, wx0, landTopY, wz0, -1, 0, 0, r * 0.7, g * 0.7, b * 0.7, 0, 0, 0);
        }
        if (eWater) {
          pushQuad(wx1, 0, wz1, wx1, 0, wz0, wx1, landTopY, wz0, wx1, landTopY, wz1, 1, 0, 0, r * 0.78, g * 0.78, b * 0.78, 0, 0, 0);
        }
      }

      // 2. Culled-face Building Voxel Column
      if (bh > 0) {
        const topY = landTopY + bh * vStepM;
        const pal = paletteRgb[bColor[i]] || paletteRgb[1];
        const r = Math.max(0, Math.min(1, pal[0] + jitter * 0.7));
        const g = Math.max(0, Math.min(1, pal[1] + jitter * 0.7));
        const b = Math.max(0, Math.min(1, pal[2] + jitter * 0.7));

        // Night window glow factor (varies per cell for natural lit-office/apartment sparkle)
        const winSeed = hashCell(gx * 13 + bh, gz * 17);
        const isLit = winSeed > 0.42;
        const glowR = isLit ? (winSeed > 0.82 ? 0.55 : 0.85) : 0.05;
        const glowG = isLit ? (winSeed > 0.82 ? 0.82 : 0.62) : 0.04;
        const glowB = isLit ? (winSeed > 0.82 ? 0.95 : 0.28) : 0.02;

        // Top roof face (always exposed on 2.5D heightfield)
        const roofShade = bh >= 10 ? 0.95 : 1.04;
        pushQuad(
          wx0, topY, wz1,
          wx1, topY, wz1,
          wx1, topY, wz0,
          wx0, topY, wz0,
          0, 1, 0,
          Math.min(1, r * roofShade),
          Math.min(1, g * roofShade),
          Math.min(1, b * roofShade),
          0, 0, 0
        );

        // Emit side faces only down to neighboring building height!
        const nH = gz > 0 ? bHeight[idx(gx, gz - 1)] : 0;
        const sH = gz < gridH - 1 ? bHeight[idx(gx, gz + 1)] : 0;
        const wH = gx > 0 ? bHeight[idx(gx - 1, gz)] : 0;
        const eH = gx < gridW - 1 ? bHeight[idx(gx + 1, gz)] : 0;

        if (bh > nH) {
          const bot = landTopY + nH * vStepM;
          pushQuad(wx1, bot, wz0, wx0, bot, wz0, wx0, topY, wz0, wx1, topY, wz0, 0, 0, -1, r * 0.78, g * 0.78, b * 0.78, glowR * 0.7, glowG * 0.7, glowB * 0.7);
        }
        if (bh > sH) {
          const bot = landTopY + sH * vStepM;
          pushQuad(wx0, bot, wz1, wx1, bot, wz1, wx1, topY, wz1, wx0, topY, wz1, 0, 0, 1, r * 0.96, g * 0.96, b * 0.96, glowR, glowG, glowB);
        }
        if (bh > wH) {
          const bot = landTopY + wH * vStepM;
          pushQuad(wx0, bot, wz0, wx0, bot, wz1, wx0, topY, wz1, wx0, topY, wz0, -1, 0, 0, r * 0.74, g * 0.74, b * 0.74, glowR * 0.75, glowG * 0.75, glowB * 0.75);
        }
        if (bh > eH) {
          const bot = landTopY + eH * vStepM;
          pushQuad(wx1, bot, wz1, wx1, bot, wz0, wx1, topY, wz0, wx1, topY, wz1, 1, 0, 0, r * 0.88, g * 0.88, b * 0.88, glowR * 0.9, glowG * 0.9, glowB * 0.9);
        }
      }

      // 3. Elevated Bridges & Lagoon Piers
      if (br > 0) {
        const deckBot = br * vStepM;
        const deckTop = deckBot + 1.8;
        const isLamp = (gx + gz) % 4 === 0;
        pushBox(
          wx0, deckBot, wz0,
          wx1, deckTop, wz1,
          0.28, 0.3, 0.34,
          1.12,
          0.8,
          isLamp ? [0.95, 0.65, 0.22] : [0, 0, 0],
          true
        );
        // Periodic support piers standing in the lagoon
        if (gx % 6 === 0 && gz % 6 === 0) {
          pushBox(
            wx0 + 1.5, 0, wz0 + 1.5,
            wx1 - 1.5, deckBot, wz1 - 1.5,
            0.55, 0.54, 0.52,
            1.0,
            0.85
          );
        }
      }

      // 4. Voxel Palm & Tropical Trees
      if (th > 0 && bh === 0) {
        const trunkTop = landTopY + 2.8;
        const crownTop = trunkTop + th * 2.1;
        // Trunk
        pushBox(
          wx0 + 2.1, landTopY, wz0 + 2.1,
          wx1 - 2.1, trunkTop, wz1 - 2.1,
          0.38, 0.26, 0.16,
          1.0,
          0.85
        );
        // Leafy voxel crown
        const gShift = hashCell(gx * 5, gz * 11) * 0.1;
        pushBox(
          wx0 + 0.4, trunkTop, wz0 + 0.4,
          wx1 - 0.4, crownTop, wz1 - 0.4,
          0.16 + gShift * 0.3, 0.44 + gShift, 0.2 + gShift * 0.2,
          1.12,
          0.82
        );
      }
    }
  }

  if (positions.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("aGlow", new THREE.Float32BufferAttribute(glows, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

export function buildPaletteRgb(palette: string[]): [number, number, number][] {
  return palette.map((hex) => hexToRgbNorm(hex));
}
