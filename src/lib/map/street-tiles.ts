// Street-level detail: where it comes from and how it is cut up.
//
// Below a few kilometres the map stops drawing 2 km squares and loads real
// streets and buildings for the area in view. Both sources are open data
// served straight to the browser, without a key:
//
//   Ground     OpenStreetMap as vector tiles from OpenFreeMap, in the
//              OpenMapTiles schema. Roads, railways, water, land use, and
//              the names of streets, areas and places. ODbL.
//   Buildings  Overture Maps, one PMTiles archive for the world read a tile
//              at a time with range requests. OpenStreetMap footprints plus
//              those Google and Microsoft traced from imagery, which cover
//              far more of Nigeria than OSM alone. ODbL. Very few carry a
//              height (see street.worker.ts for how the rest are guessed).
//
// Both are cut in Web Mercator at zoom 14, tiles of about 2.4 km in Nigeria.
// The scene is a transverse Mercator (projection.ts), so a tile is a square
// in the worker's arithmetic and a slightly turned, slightly stretched
// four-sided shape in the scene. Each tile carries its four corners and
// everything in it is placed by blending between them, which keeps
// neighbouring tiles edge to edge.
//
// This file is shared by the page and by the worker that builds the tiles.

import { latLonToWorld, lonLatToTile, tileToLatLon, worldToLatLon } from "./projection";

export const TILE_ZOOM = 14;

/** Corners of a tile in the scene, km: north-west, north-east, south-west, south-east. */
export type Corners = [[number, number], [number, number], [number, number], [number, number]];

export function tileCorners(col: number, row: number): Corners {
  const at = (x: number, y: number) => latLonToWorld(...tileToLatLon(x, y, TILE_ZOOM));
  return [at(col, row), at(col + 1, row), at(col, row + 1), at(col + 1, row + 1)];
}

/** The tile under a scene position. */
export function tileAt(x: number, z: number): [col: number, row: number] {
  const [lat, lon] = worldToLatLon(x, z);
  const [tx, ty] = lonLatToTile(lat, lon, TILE_ZOOM);
  return [Math.floor(tx), Math.floor(ty)];
}

/**
 * Where a point of a tile lands, km from the tile's north-west corner.
 * u runs east and v south across the tile, 0 to 1.
 */
export function warp(corners: Corners, u: number, v: number): [x: number, z: number] {
  const [nw, ne, sw, se] = corners;
  const x = (ne[0] - nw[0]) * u + (sw[0] - nw[0]) * v + (se[0] - ne[0] - sw[0] + nw[0]) * u * v;
  const z = (ne[1] - nw[1]) * u + (sw[1] - nw[1]) * v + (se[1] - ne[1] - sw[1] + nw[1]) * u * v;
  return [x, z];
}

/** Side of a tile in km: the worker's square stand-in for it. */
export function tileSide(corners: Corners): number {
  const [nw, ne, sw] = corners;
  return (Math.hypot(ne[0] - nw[0], ne[1] - nw[1]) + Math.hypot(sw[0] - nw[0], sw[1] - nw[1])) / 2;
}

export type StreetLabelKind =
  "street" | "canal" | "hood" | "station" | "civic" | "campus" | "area" | "building";

/** A name found in a tile. Positions are km from the tile's north-west corner. */
export interface StreetLabel {
  text: string;
  kind: StreetLabelKind;
  x: number;
  z: number;
  /** Lower ranks win when two names would overlap. */
  rank: number;
  /** The name shows while the camera is closer than this, km. */
  reach: number;
  /** Direction of the street in the scene, radians. Names follow it. */
  angle?: number;
}

/**
 * Flat geometry: everything that lies on the ground, in drawing order.
 * Positions are u, v across the tile (see warp); the shader places them.
 */
export interface GroundMesh {
  positions: Float32Array;
  /** r, g, b, and what the surface is (see SURFACE below). */
  colours: Uint8Array;
  indices: Uint32Array;
}

/** Upright geometry: buildings, or trees. */
export interface SolidMesh {
  /** x, y, z triples in km from the tile's north-west corner; y is height above the ground. */
  positions: Float32Array;
  normals: Int8Array;
  /** r, g, b, and for walls a seed for their windows (0 means no windows). */
  colours: Uint8Array;
  /** Distance along the wall in metres, so windows line up around corners. */
  along: Float32Array;
  indices: Uint32Array;
}

/**
 * Centre lines packed for whatever follows them. Each line is its number
 * of points, how far from the centre line to keep (km), how busy it is
 * (1 for an ordinary street), and then its points as x, z pairs in km from
 * the tile's north-west corner.
 */
export type RouteLines = Float32Array;

/** What moves along the routes of a tile: walkers, motorbikes, cars, trains. */
export type MoverKey = "walks" | "rides" | "drives" | "rails";

export const SURFACE = {
  plain: 0,
  /** Lit by street lamps at night. */
  road: 1,
  water: 2,
} as const;

export type StreetPart = "ground" | "buildings";

export interface StreetRequest {
  id: number;
  part: StreetPart;
  col: number;
  row: number;
  /** Residents per km² around the tile, for guessing how tall buildings are. */
  density: number;
  /** A phone: fewer trees and buildings per tile. */
  lite: boolean;
}

export type StreetResponse =
  | { id: number; ok: false; error: string }
  | {
      id: number;
      ok: true;
      part: "ground";
      /** Null where the tile has nothing in it, such as open sea. */
      ground: GroundMesh | null;
      trees: SolidMesh | null;
      labels: StreetLabel[];
      /** Where walkers, motorbikes, cars and trains go. */
      routes: Record<MoverKey, RouteLines | null>;
      /** Street lamps: x, z (km from the corner) and the way the arm points. */
      lamps: Float32Array | null;
    }
  | {
      id: number;
      ok: true;
      part: "buildings";
      buildings: SolidMesh | null;
      /** Where the footprints came from: Overture, or OSM when Overture could not be reached. */
      source: "overture" | "osm";
    };
