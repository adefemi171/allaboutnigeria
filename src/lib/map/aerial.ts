// The ground as a satellite picture: EOX's cloud-free mosaic of Sentinel-2
// from 2016, the only keyless imagery cleared for display on a commercial
// site (CC BY 4.0). Pixels are 10 m, so it is sharp from a region down to a
// neighbourhood and soft at street level. AERIAL holds everything that
// names the source, so it can be swapped in one place.
//
// The tiles are Web Mercator, so each is a small mesh whose points are
// projected into the scene one by one and lifted onto the model's relief.

import * as THREE from "three";
import { clamp } from "./math";
import { latLonToWorld, lonLatToTile, tileToLatLon, worldToLatLon } from "./projection";
import { FOG_GLSL, LIGHTING_GLSL } from "./style";
import type { SharedUniforms } from "./terrain";

/** What the ground is drawn with: the atlas model, or the satellite picture. */
export type GroundMode = "model" | "aerial";

export const AERIAL = {
  url: (z: number, x: number, y: number) =>
    `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${z}/${y}/${x}.jpg`,
  /** Finer levels exist, but they are the same 10 m pixels enlarged. */
  maxZoom: 14,
  credit: "Sentinel-2 cloudless 2016 by EOX, 10 m",
  attribution:
    "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)",
};

const MIN_ZOOM = 4;

interface Tile {
  key: string;
  zoom: number;
  col: number;
  row: number;
  mesh: THREE.Mesh | null;
  texture: THREE.Texture | null;
  /** Set while the picture is on its way. */
  abort: AbortController | null;
}

/** One level finer every time the camera halves its distance (km): a tile about half the view. */
function zoomForDistance(dist: number): number {
  return clamp(Math.round(Math.log2(39500 / (dist * 0.6))), MIN_ZOOM, AERIAL.maxZoom);
}

const VERTEX = /* glsl */ `
attribute float aGround; // height of the ground, scene km at full relief
uniform float uRelief;
uniform float uLift;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  world.y = aGround * uRelief + uLift * (1.0 - uRelief) + 0.00025;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vWorld;
${LIGHTING_GLSL}
${FOG_GLSL}
void main() {
  vec3 picture = texture2D(uMap, vUv).rgb;
  // The picture was taken by day; at night it dims like everything else.
  picture *= mix(0.22, 1.0, dayAmount(vec3(0.0, 1.0, 0.0)));
  gl_FragColor = vec4(applyFog(picture, vWorld), 1.0);
}
`;

type HeightAt = (x: number, z: number) => number;

export class Aerial {
  readonly group = new THREE.Group();
  private mode: GroundMode = "model";
  private tiles = new Map<string, Tile>();
  private lastKey = "";

  constructor(
    private shared: SharedUniforms,
    /** The model's extent, km: no pictures beyond it, where the globe has its own. */
    private bounds: { x0: number; z0: number; x1: number; z1: number },
    private heightAt: HeightAt,
    private maxTiles: number,
    private redraw: () => void,
  ) {
    this.group.visible = false;
  }

  setMode(mode: GroundMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.group.visible = mode !== "model";
    this.lastKey = "";
    if (mode === "model") this.dispose();
    this.redraw();
  }

  /**
   * Keep tiles under the camera. Returns true while something is still
   * loading, so the engine can keep drawing.
   */
  update(view: { x: number; z: number; dist: number }): boolean {
    if (this.mode === "model") return false;

    const zoom = zoomForDistance(view.dist);
    const viewKey = `${zoom}:${view.x.toFixed(1)}:${view.z.toFixed(1)}`;
    if (viewKey !== this.lastKey) {
      this.lastKey = viewKey;
      this.request(view, zoom);
    }

    // The pictures of the level in view may still be on their way. Until
    // they are all there, those of the level before stay as a stand-in.
    const loading = [...this.tiles.values()].some((tile) => tile.zoom === zoom && tile.abort);
    for (const tile of [...this.tiles.values()]) {
      if (tile.zoom !== zoom && (!loading || !tile.mesh)) this.drop(tile);
    }
    return loading;
  }

  /** Ask for the tiles around the camera, nearest first, and let go of the rest. */
  private request(view: { x: number; z: number; dist: number }, zoom: number): void {
    const [lat, lon] = worldToLatLon(view.x, view.z);
    const [fx, fy] = lonLatToTile(lat, lon, zoom);
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const tileKm = 39500 / 2 ** zoom;
    const radius = Math.max(1, Math.ceil((view.dist * 1.3) / tileKm));
    const { x0, z0, x1, z1 } = this.bounds;
    const around: { col: number; row: number; away: number }[] = [];
    for (let row = cy - radius; row <= cy + radius; row++) {
      for (let col = cx - radius; col <= cx + radius; col++) {
        const [nwx, nwz] = latLonToWorld(...tileToLatLon(col, row, zoom));
        const [sex, sez] = latLonToWorld(...tileToLatLon(col + 1, row + 1, zoom));
        if (sex < x0 || nwx > x1 || sez < z0 || nwz > z1) continue;
        around.push({ col, row, away: (col + 0.5 - fx) ** 2 + (row + 0.5 - fy) ** 2 });
      }
    }
    around.sort((a, b) => a.away - b.away);

    const wanted = new Set<string>();
    for (const { col, row } of around.slice(0, this.maxTiles)) {
      const key = `${zoom}:${col}:${row}`;
      wanted.add(key);
      if (this.tiles.has(key)) continue;
      const tile: Tile = { key, zoom, col, row, mesh: null, texture: null, abort: null };
      this.tiles.set(key, tile);
      this.load(tile);
    }
    for (const tile of [...this.tiles.values()]) {
      if (tile.zoom === zoom && !wanted.has(tile.key)) this.drop(tile);
    }
  }

  dispose(): void {
    for (const tile of [...this.tiles.values()]) this.drop(tile);
  }

  /** A tile as a grid of points, each projected into the scene and set on the relief. */
  private geometry(tile: Tile): THREE.BufferGeometry {
    // Fine enough to follow the curve of the projection and the hills.
    const steps = clamp(2 ** (11 - tile.zoom), 2, 16);
    const positions: number[] = [];
    const uvs: number[] = [];
    const ground: number[] = [];
    const [ox, oz] = latLonToWorld(...tileToLatLon(tile.col, tile.row, tile.zoom));
    for (let j = 0; j <= steps; j++) {
      for (let i = 0; i <= steps; i++) {
        const [x, z] = latLonToWorld(...tileToLatLon(tile.col + i / steps, tile.row + j / steps, tile.zoom));
        positions.push(x - ox, 0, z - oz);
        uvs.push(i / steps, 1 - j / steps);
        ground.push(this.heightAt(x, z));
      }
    }
    const indices: number[] = [];
    for (let j = 0; j < steps; j++) {
      for (let i = 0; i < steps; i++) {
        const a = j * (steps + 1) + i;
        indices.push(a, a + steps + 1, a + 1, a + 1, a + steps + 1, a + steps + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("aGround", new THREE.Float32BufferAttribute(ground, 1));
    geometry.setIndex(indices);
    geometry.translate(ox, 0, oz);
    return geometry;
  }

  private load(tile: Tile): void {
    const abort = new AbortController();
    tile.abort = abort;
    fetch(AERIAL.url(tile.zoom, tile.col, tile.row), { signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Aerial: HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => createImageBitmap(blob, { imageOrientation: "flipY" }))
      .then((bitmap) => {
        if (abort.signal.aborted) {
          bitmap.close();
          return;
        }
        const texture = new THREE.Texture(bitmap);
        // The bitmap is flipped already.
        texture.flipY = false;
        texture.colorSpace = THREE.NoColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        tile.texture = texture;
        tile.abort = null;
        const material = new THREE.ShaderMaterial({
          uniforms: { ...this.shared, uMap: { value: texture } },
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          // Finer pictures are drawn over the coarser ones they replace.
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: AERIAL.maxZoom + 1 - tile.zoom,
        });
        tile.mesh = new THREE.Mesh(this.geometry(tile), material);
        tile.mesh.renderOrder = -1;
        tile.mesh.frustumCulled = false;
        this.group.add(tile.mesh);
        this.redraw();
      })
      // A picture that will not load leaves the globe showing through.
      .catch(() => {
        if (!abort.signal.aborted) tile.abort = null;
      });
  }

  private drop(tile: Tile): void {
    tile.abort?.abort();
    tile.abort = null;
    if (tile.mesh) {
      this.group.remove(tile.mesh);
      tile.mesh.geometry.dispose();
      (tile.mesh.material as THREE.Material).dispose();
      tile.mesh = null;
    }
    tile.texture?.dispose();
    (tile.texture?.image as ImageBitmap | undefined)?.close();
    tile.texture = null;
    this.tiles.delete(tile.key);
  }
}
