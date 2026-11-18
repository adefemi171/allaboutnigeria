/**
 * Shared voxel-world builder: projection, grid rasterisers, the common
 * water / parks / roads / buildings passes, and the .bin + meta.json writer.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// 6m per horizontal voxel, 3m per vertical voxel unit
export const CELL_M = 6;
export const V_STEP_M = 3;

// Building palette indices 0..18; each world appends its own colour 19
export const PALETTE_BASE = [
  "#000000", // 0 unused
  "#e7e1d5", // 1 warm stucco / cream
  "#d5cbb8", // 2 sand concrete
  "#c6b79f", // 3 warm beige plaster
  "#b5a38b", // 4 muted ochre concrete
  "#c96d49", // 5 terracotta / rust roof & facade
  "#a95338", // 6 deep laterite brick
  "#8e96a0", // 7 cool corporate concrete
  "#6e7a88", // 8 slate commercial facade
  "#5a7c94", // 9 glass curtain blue
  "#4c6c84", // 10 deep glass tower
  "#7399ac", // 11 light cyan architectural glass
  "#d8a45c", // 12 golden sandstone facade
  "#cbb48c", // 13 limestone office
  "#7f867b", // 14 olive concrete
  "#b87956", // 15 warm burnt sienna
  "#e2d9ca", // 16 bright stone
  "#525963", // 17 charcoal steel tower
  "#89a399", // 18 seafoam modern tower
];

const NAMED_COLOURS = {
  white: "#e8e6e0",
  beige: "#dfd3be",
  cream: "#ede5d2",
  yellow: "#e5c158",
  brown: "#8f694b",
  red: "#b85d43",
  terracotta: "#c66b49",
  grey: "#9ba0a8",
  gray: "#9ba0a8",
  blue: "#638ea8",
  green: "#628b74",
  black: "#3d424b",
  orange: "#d27d46",
};

const rgb = (hex) => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16));

/** Nearest palette index for an OSM `building:colour` tag, or null if unparseable. */
export function colourToPaletteIndex(colour, palette) {
  if (!colour) return null;
  const clean = colour.trim().toLowerCase();
  const hex = /^#[0-9a-f]{6}$/.test(clean) ? clean : NAMED_COLOURS[clean];
  if (!hex) return null;
  const [r, g, b] = rgb(hex);
  let best = 1;
  let bestDist = Infinity;
  for (let i = 1; i < palette.length; i++) {
    const [pr, pg, pb] = rgb(palette[i]);
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Deterministic 0..1 pseudo-random from an integer id. */
export function hashId(id) {
  const h = (Math.abs(id) * 2654435761) >>> 0;
  return (h % 1000) / 1000;
}

export const pick = (choices, hash) => choices[Math.floor(hash * choices.length) % choices.length];

export function makeProjection(centerLat, centerLon) {
  const mPerLat = 110574;
  const mPerLon = 111320 * Math.cos((centerLat * Math.PI) / 180);
  // +X east, +Z south
  return (lat, lon) => [(lon - centerLon) * mPerLon, -(lat - centerLat) * mPerLat];
}

/**
 * @param {{ centerLat: number, centerLon: number, halfWM: number, halfHM: number, palette: string[], ground?: number }} spec
 *   `ground` is the initial surface type of every cell.
 */
export function createWorld({ centerLat, centerLon, halfWM, halfHM, palette, ground = 1 }) {
  const gridW = Math.floor((halfWM * 2) / CELL_M);
  const gridH = Math.floor((halfHM * 2) / CELL_M);
  const totalCells = gridW * gridH;
  const latLonToMeters = makeProjection(centerLat, centerLon);

  const idx = (gx, gz) => gz * gridW + gx;
  const inBounds = (gx, gz) => gx >= 0 && gx < gridW && gz >= 0 && gz < gridH;
  const cellAt = (lat, lon) => {
    const [x, z] = latLonToMeters(lat, lon);
    return [Math.floor((x + halfWM) / CELL_M), Math.floor((z + halfHM) / CELL_M)];
  };

  function drawDisc(arr, cx, cz, radius, val, cond = null) {
    const r2 = radius * radius;
    const rc = Math.ceil(radius);
    for (let dz = -rc; dz <= rc; dz++) {
      const gz = cz + dz;
      if (gz < 0 || gz >= gridH) continue;
      for (let dx = -rc; dx <= rc; dx++) {
        if (dx * dx + dz * dz > r2) continue;
        const gx = cx + dx;
        if (gx < 0 || gx >= gridW) continue;
        const i = idx(gx, gz);
        if (!cond || cond(arr[i], i)) arr[i] = val;
      }
    }
  }

  /** Calls cb(gx, gz) for every cell along the polyline (cells may be out of bounds). */
  function tracePolyline(coords, cb) {
    for (let i = 0; i < coords.length - 1; i++) {
      const [gx0, gz0] = cellAt(coords[i][0], coords[i][1]);
      const [gx1, gz1] = cellAt(coords[i + 1][0], coords[i + 1][1]);
      const steps = Math.max(Math.abs(gx1 - gx0), Math.abs(gz1 - gz0), 1);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        cb(Math.round(gx0 + (gx1 - gx0) * t), Math.round(gz0 + (gz1 - gz0) * t));
      }
    }
  }

  /** Scanline fill; calls cb(gx, gz) for every in-bounds cell inside the polygon. */
  function fillPolygon(coords, cb) {
    if (coords.length < 3) return;
    const pts = coords.map(([lat, lon]) => {
      const [mx, mz] = latLonToMeters(lat, lon);
      return [(mx + halfWM) / CELL_M, (mz + halfHM) / CELL_M];
    });
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [px, pz] of pts) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }
    const x0 = Math.max(0, Math.floor(minX));
    const x1 = Math.min(gridW - 1, Math.ceil(maxX));
    const z0 = Math.max(0, Math.floor(minZ));
    const z1 = Math.min(gridH - 1, Math.ceil(maxZ));

    for (let gz = z0; gz <= z1; gz++) {
      const py = gz + 0.5;
      const ints = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py)) ints.push(((xj - xi) * (py - yi)) / (yj - yi) + xi);
      }
      ints.sort((a, b) => a - b);
      for (let k = 0; k < ints.length - 1; k += 2) {
        const sx = Math.max(x0, Math.floor(ints[k]));
        const ex = Math.min(x1, Math.floor(ints[k + 1]));
        for (let gx = sx; gx <= ex; gx++) cb(gx, gz);
      }
    }
  }

  return {
    centerLat,
    centerLon,
    halfWM,
    halfHM,
    palette,
    gridW,
    gridH,
    totalCells,
    // 0 water, 1 land, 2 grass/park, 3 road, 4 major arterial, 5 shoreline sand
    surface: new Uint8Array(totalCells).fill(ground),
    bHeight: new Uint8Array(totalCells), // building height in V_STEP_M units
    bColor: new Uint8Array(totalCells), // palette index
    bridgeH: new Uint8Array(totalCells), // 0 none, else deck height in V_STEP_M units
    treeH: new Uint8Array(totalCells), // 0 none, else canopy height
    latLonToMeters,
    cellAt,
    idx,
    inBounds,
    drawDisc,
    tracePolyline,
    fillPolygon,
  };
}

/** Closed water ways become water polygons; rivers/canals are carved `channelRadius(w)` cells wide. */
export function carveWater(world, waters, channelRadius) {
  const { surface, idx } = world;
  for (const w of waters) {
    if (!w.waterway) {
      world.fillPolygon(w.coords, (gx, gz) => {
        surface[idx(gx, gz)] = 0;
      });
    } else if (w.waterway === "river" || w.waterway === "canal") {
      const rad = channelRadius(w);
      world.tracePolyline(w.coords, (gx, gz) => world.drawDisc(surface, gx, gz, rad, 0));
    }
  }
}

/** Paint parks as grass and plant a tree on even cells whose hash exceeds `treeCut`. */
export function paintParks(world, parks, treeCut, treeHeight = () => 2) {
  const { surface, treeH, idx } = world;
  for (const p of parks) {
    world.fillPolygon(p.coords, (gx, gz) => {
      const i = idx(gx, gz);
      if (surface[i] === 0) return;
      surface[i] = 2;
      const h = hashId(gx * 73856093 + gz * 19349663);
      if (h > treeCut && gx % 2 === 0 && gz % 2 === 0) treeH[i] = treeHeight(h);
    });
  }
}

/** Street trees on bare land, sampled every `step` cells; keep(x, z, hash) decides. */
export function scatterTrees(world, margin, step, keep) {
  const { surface, treeH, idx, gridW, gridH } = world;
  for (let z = margin; z < gridH - margin; z += step) {
    for (let x = margin; x < gridW - margin; x += step) {
      const i = idx(x, z);
      if (surface[i] === 1 && keep(x, z, hashId(x * 83492791 + z * 2971215073))) treeH[i] = 2;
    }
  }
}

/**
 * @param {{ major: string[], mid: string, radii: [number, number, number], bridgeElev?: (road) => number }} style
 *   radii are in cells for [major, mid, everything else].
 */
export function paintRoads(world, roads, { major, mid, radii, bridgeElev = () => 2 }) {
  const { surface, bridgeH, treeH } = world;
  for (const r of roads) {
    const isMajor = major.includes(r.highway);
    const rad = isMajor ? radii[0] : r.highway === mid ? radii[1] : radii[2];
    if (r.bridge) {
      const elev = bridgeElev(r);
      world.tracePolyline(r.coords, (gx, gz) => world.drawDisc(bridgeH, gx, gz, rad, elev));
    } else {
      const val = isMajor ? 4 : 3;
      world.tracePolyline(r.coords, (gx, gz) => {
        world.drawDisc(surface, gx, gz, rad, val, (cur) => cur !== 0);
        world.drawDisc(treeH, gx, gz, rad, 0);
      });
    }
  }
}

/**
 * Rasterise OSM building footprints. Height comes from OSM tags, else
 * fallbackMeters(hash, b); colour from paletteIndex(voxH, hash, b).
 * @returns {number[]} voxel height of each building
 */
export function stampBuildings(world, buildings, { levelM, maxVox, fallbackMeters, paletteIndex }) {
  const { surface, bHeight, bColor, treeH, idx } = world;
  return buildings.map((b) => {
    const hash = hashId(b.id);
    let meters = b.height || (b.levels ? b.levels * levelM : 0);
    if (!meters || Number.isNaN(meters)) meters = fallbackMeters(hash, b);
    const voxH = Math.max(2, Math.min(maxVox, Math.round(meters / V_STEP_M)));
    const palIdx = paletteIndex(voxH, hash, b);

    world.fillPolygon(b.coords, (gx, gz) => {
      const i = idx(gx, gz);
      if (surface[i] === 0) surface[i] = 1;
      if (voxH > bHeight[i]) {
        bHeight[i] = voxH;
        bColor[i] = palIdx;
        treeH[i] = 0;
      }
    });
    return voxH;
  });
}

/**
 * Stamp a tower with a tapered crown: a (2*radius+1)² square clipped to
 * Manhattan distance `reach`, losing `taper` of its height per ring (min `minH`).
 */
export function stampTower(world, lat, lon, { radius, reach, height, minH, taper, palIdx }) {
  const { bHeight, bColor } = world;
  const [cx, cz] = world.cellAt(lat, lon);
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.abs(dx) + Math.abs(dz) > reach) continue;
      const gx = cx + dx;
      const gz = cz + dz;
      if (!world.inBounds(gx, gz)) continue;
      const i = world.idx(gx, gz);
      const dist = Math.max(Math.abs(dx), Math.abs(dz));
      const h = dist === 0 ? height : Math.max(minH, Math.round(height * (1 - dist * taper)));
      if (h > bHeight[i]) {
        bHeight[i] = h;
        bColor[i] = palIdx;
      }
    }
  }
}

/** Project [lat, lon] coords to scene-space [x, y, z] points at a fixed height. */
export function toPath(world, coords, y) {
  return coords.map(([lat, lon]) => {
    const [mx, mz] = world.latLonToMeters(lat, lon);
    return [Number(mx.toFixed(1)), y, Number(mz.toFixed(1))];
  });
}

/**
 * Vehicle routes along roads, longest first.
 * @param {{ minPts: number, minLen: number, yBridge: number, fallbackName: (road) => string, kinds?: string[] }} opts
 *   `kinds` limits non-bridge roads to those highway types.
 */
export function trafficRoutes(world, roads, { minPts, minLen, yBridge, fallbackName, kinds }) {
  const routes = [];
  for (const r of roads) {
    if (r.coords.length < minPts) continue;
    if (kinds && !r.bridge && !kinds.includes(r.highway)) continue;
    const pts = toPath(world, r.coords, r.bridge ? yBridge : 3.2);
    let len = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      len += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][2] - pts[k][2]);
    }
    if (len > minLen) {
      routes.push({
        name: r.name || fallbackName(r),
        kind: r.bridge ? "bridge" : r.highway,
        len: Math.round(len),
        pts,
      });
    }
  }
  return routes.sort((a, b) => b.len - a.len);
}

/**
 * Write `<name>.bin` and its meta JSON. `meta` is appended after the grid fields.
 * The .bin is gzipped (servers don't compress octet-streams, and the grid shrinks ~25×);
 * unzipped: 16-byte header [magic 'LAGV', gridW u16, gridH u16, cellM u16, vStepM u16, paletteLen u32],
 * then 4 bytes per cell [surface, bHeight, bColor, bridgeH:4 | treeH:4].
 * @returns {number} size of the binary in bytes
 */
export function writeWorld(world, outDir, binName, metaName, meta) {
  const { gridW, gridH, totalCells, surface, bHeight, bColor, bridgeH, treeH } = world;
  const headerSize = 16;
  const buf = Buffer.alloc(headerSize + totalCells * 4);
  buf.write("LAGV", 0, "ascii");
  buf.writeUInt16LE(gridW, 4);
  buf.writeUInt16LE(gridH, 6);
  buf.writeUInt16LE(CELL_M, 8);
  buf.writeUInt16LE(V_STEP_M, 10);
  buf.writeUInt32LE(world.palette.length, 12);

  for (let i = 0; i < totalCells; i++) {
    const off = headerSize + i * 4;
    buf[off] = surface[i];
    buf[off + 1] = bHeight[i];
    buf[off + 2] = bColor[i];
    buf[off + 3] = ((bridgeH[i] & 0x0f) << 4) | (treeH[i] & 0x0f);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, binName), zlib.gzipSync(buf, { level: 9 }));
  fs.writeFileSync(
    path.join(outDir, metaName),
    JSON.stringify({
      gridW,
      gridH,
      cellM: CELL_M,
      vStepM: V_STEP_M,
      halfWM: world.halfWM,
      halfHM: world.halfHM,
      centerLat: world.centerLat,
      centerLon: world.centerLon,
      palette: world.palette,
      ...meta,
    })
  );
  return buf.length;
}
