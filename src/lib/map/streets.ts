// Street level. Once the camera is within a few kilometres of the ground
// the map loads real streets, water and buildings for the area in view and
// draws them over the flattened model.
//
// The work of downloading and building a tile happens in a worker
// (street.worker.ts). This file decides which tiles are needed, keeps the
// ones that were built, and draws them.

import * as THREE from "three";
import type { Grid } from "./grid";
import type { LabelGroup, Labels, LabelSpec } from "./labels";
import { lampMeshes } from "./lamps";
import { clamp, smoothstep } from "./math";
import { Traffic, figureSize, type Surroundings } from "./movers";
import {
  tileAt,
  tileCorners,
  tileSide,
  type Corners,
  type GroundMesh,
  type SolidMesh,
  type StreetPart,
  type StreetRequest,
  type StreetResponse,
} from "./street-tiles";
import { FOG_GLSL, LIGHTING_GLSL } from "./style";
import type { SharedUniforms } from "./terrain";

/** The part of a camera pose that matters here. */
export interface View {
  x: number;
  z: number;
  dist: number;
  az: number;
  tilt: number;
}

export interface StreetStatus {
  /** Street-level detail is being drawn. */
  visible: boolean;
  /** Tiles for the area in view are on their way. */
  loading: boolean;
  /** Tiles for the area in view could not be loaded. */
  failed: boolean;
}

/** Camera distances, km. Tiles are asked for a little before they show. */
const GROUND_FROM = 4.6;
const GROUND_FADE: [number, number] = [3.4, 4.4];
const BUILD_FROM = 2.3;
const BUILD_FADE: [number, number] = [1.7, 2.2];

const MAX_REQUESTS = 6;
const RETRY_AFTER = 15_000;
/** About the side of a tile in Nigeria, km, for deciding how many to look at. */
const TILE_KM = 2.4;

const GROUND_VERTEX = /* glsl */ `
attribute vec4 aColor;  // rgb, and what the surface is
uniform float uLift;
uniform vec2 uEast;     // north-east corner, from the north-west one
uniform vec2 uSouth;    // south-west corner
uniform vec2 uTwist;    // how far the south-east corner is off a parallelogram
varying vec4 vColor;
varying vec2 vLocal;
varying vec3 vWorld;
void main() {
  // Positions are fractions of the tile, east and south (see warp() in
  // street-tiles.ts), blended between its corners.
  vec2 at = uEast * position.x + uSouth * position.y + uTwist * position.x * position.y;
  vec3 p = vec3(at.x, uLift, at.y);
  vColor = aColor;
  vLocal = position.xy;
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const GROUND_FRAGMENT = /* glsl */ `
uniform float uShow;
uniform float uStreet;
uniform vec2 uFocus;
uniform float uGroundReach;
varying vec4 vColor;
varying vec2 vLocal;
varying vec3 vWorld;
${LIGHTING_GLSL}
${FOG_GLSL}
void main() {
  // Tiles overlap a little at their edges. Each draws only its own square.
  if (vLocal.x < 0.0 || vLocal.y < 0.0 || vLocal.x > 1.0 || vLocal.y > 1.0) discard;
  // Detail fades out towards the edge of the area that is loaded.
  float near = 1.0 - smoothstep(uGroundReach * 0.8, uGroundReach, distance(vWorld.xz, uFocus));
  float alpha = uShow * uStreet * near;
  if (alpha < 0.004) discard;

  vec3 up = vec3(0.0, 1.0, 0.0);
  float surface = vColor.a * 255.0;
  vec3 colour = shade(toLinear(vColor.rgb), up, up, 1.0);
  float night = 1.0 - dayAmount(up);
  // Street lamps.
  if (surface > 0.5 && surface < 1.5) colour += vec3(1.0, 0.72, 0.4) * night * 0.05;
  gl_FragColor = vec4(toDisplay(applyFog(colour, vWorld)), alpha);
}
`;

const SOLID_VERTEX = /* glsl */ `
attribute vec4 aColor;   // rgb, and a seed for the windows (0 for none)
attribute float aAlong;  // metres along the wall
uniform float uGrow;
uniform float uBuild;
uniform float uLift;
uniform vec2 uFocus;
uniform float uBuildReach;
varying vec3 vAlbedo;
varying float vSeed;
varying float vGrow;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vWall;
${LIGHTING_GLSL}
void main() {
  // Buildings rise out of their footprints, and stay down beyond the edge
  // of the area that is loaded.
  vec4 foot = modelMatrix * vec4(position.x, 0.0, position.z, 1.0);
  float near = 1.0 - smoothstep(uBuildReach * 0.75, uBuildReach, distance(foot.xz, uFocus));
  vGrow = uGrow * uBuild * near;
  vec3 p = vec3(position.x, position.y * vGrow + uLift, position.z);
  vAlbedo = toLinear(aColor.rgb);
  vSeed = aColor.a * 255.0;
  vNormal = normal;
  vWall = vec2(aAlong, position.y * 1000.0);
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const SOLID_FRAGMENT = /* glsl */ `
varying vec3 vAlbedo;
varying float vSeed;
varying float vGrow;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vWall;
${LIGHTING_GLSL}
${FOG_GLSL}
float windowNoise(vec2 cell) {
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  if (vGrow < 0.004) discard;
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 n = normalize(vNormal);
  bool wall = n.y < 0.5;
  vec3 albedo = vAlbedo;
  vec3 glow = vec3(0.0);
  float night = 1.0 - dayAmount(up);

  if (wall && vSeed > 0.5) {
    // Windows: a column every 2.4 m, a storey every 3 m. They fade out
    // once they are too small to draw cleanly.
    vec2 g = vec2(vWall.x / 2.4, vWall.y / 3.0);
    vec2 w = fwidth(g);
    float show = clamp(1.0 - max(w.x, w.y) * 2.2, 0.0, 1.0);
    vec2 f = fract(g);
    float pane =
      smoothstep(0.24 - w.x, 0.24 + w.x, f.x) * (1.0 - smoothstep(0.76 - w.x, 0.76 + w.x, f.x)) *
      smoothstep(0.30 - w.y, 0.30 + w.y, f.y) * (1.0 - smoothstep(0.80 - w.y, 0.80 + w.y, f.y));
    float lit = step(0.6, windowNoise(floor(g) + vSeed * 13.0));
    albedo = mix(albedo, albedo * 0.42 + vec3(0.012, 0.02, 0.035), pane * show * 0.9);
    // From afar the lit windows blur into a soft glow on the wall.
    glow = vec3(1.0, 0.72, 0.38) * night * mix(0.11, pane * lit * 0.95, show);
  }

  vec3 colour = shade(albedo, n, up, 1.0);
  if (wall) {
    // Walls are darker towards the street, where less sky reaches them.
    colour *= 0.78 + 0.22 * smoothstep(0.0, 9.0, vWall.y);
  }
  colour += glow;
  gl_FragColor = vec4(toDisplay(applyFog(colour, vWorld)), 1.0);
}
`;

type PartState = "idle" | "loading" | "ready" | "failed";

interface Tile {
  key: string;
  col: number;
  row: number;
  /** Scene position of the north-west corner. */
  x: number;
  z: number;
  corners: Corners;
  /** Scene position of the middle. */
  mx: number;
  mz: number;
  /** Half the width of the tile, km, for deciding whether it is in reach. */
  half: number;
  /** False for tiles with no Nigerian ground in them, which are never loaded. */
  nigerian: boolean;
  state: Record<StreetPart, PartState>;
  request: Partial<Record<StreetPart, number>>;
  failedAt: Record<StreetPart, number>;
  /** Everything drawn for the tile, with what it is in userData.layer. */
  meshes: THREE.Mesh[];
  buildingMesh: THREE.Mesh | null;
  show: { value: number };
  grow: { value: number };
  /** 0 to 1, eased into grow. */
  growTime: number;
  labels: LabelGroup | null;
  /** When the tile was last needed, for deciding what to throw away. */
  used: number;
}

/** What a mesh of a tile is, which decides when it shows. */
type Layer = "ground" | "trees" | "buildings" | "lamps" | "lamplight";

/** Drop the copy in memory once the data is on the graphics card. */
function release(this: { array: unknown }): void {
  this.array = null;
}

export class Streets {
  readonly group = new THREE.Group();
  /** Something is moving on the streets, so the map has to keep drawing. */
  strolling = false;

  private photo = false;

  private worker: Worker | null = null;
  private tiles = new Map<string, Tile>();
  private pending = new Map<number, { tile: Tile; part: StreetPart }>();
  private nextId = 1;
  private clock = 0;
  private status: StreetStatus = { visible: false, loading: false, failed: false };
  private uniforms = {
    uStreet: { value: 0 },
    uBuild: { value: 0 },
    uFocus: { value: new THREE.Vector2() },
    uGroundReach: { value: 1 },
    uBuildReach: { value: 1 },
    uLampSize: { value: 1 },
  };
  /**
   * Phones get a smaller area: less to download and less to hold. A tile
   * is 2.4 km across and a Lagos one holds 8,000 buildings, so the budgets
   * are counted in few tiles.
   */
  private scale: number;
  private groundLimit: number;
  private buildingLimit: number;
  private traffic: Traffic;

  constructor(
    private grid: Grid,
    around: Surroundings,
    private shared: SharedUniforms,
    private labels: Labels,
    /** Called when something arrived and the map needs drawing again. */
    private redraw: () => void,
    private onStatus: (status: StreetStatus) => void,
    private lite: boolean,
    reducedMotion: boolean,
  ) {
    this.scale = lite ? 0.8 : 1;
    this.groundLimit = lite ? 10 : 20;
    this.buildingLimit = lite ? 3 : 7;
    this.group.visible = false;
    this.traffic = new Traffic(around, shared, lite, reducedMotion);
    this.group.add(this.traffic.group);
  }

  /** Leave the flat ground out, so the satellite picture shows under the buildings. */
  setPhoto(photo: boolean): void {
    this.photo = photo;
    this.redraw();
  }

  /** Show or hide the people, okadas, cars and trains on the streets. */
  setPeople(shown: boolean): void {
    this.traffic.enabled = shown;
    this.redraw();
  }

  // -------------------------------------------------------------- tiles --

  /** The middle of the area in view: ahead of the target when tilted. */
  private focus(view: View): [number, number] {
    const az = (view.az * Math.PI) / 180;
    const ahead = view.dist * 0.3 * Math.min(1.2, view.tilt / 60);
    return [view.x + Math.sin(az) * ahead, view.z - Math.cos(az) * ahead];
  }
  private groundReach(dist: number): number {
    return clamp(1.3 * dist, 1.2, 2.6) * this.scale;
  }
  private buildReach(dist: number): number {
    return clamp(1.2 * dist, 0.7, 1.4) * this.scale;
  }

  private tile(col: number, row: number): Tile {
    const key = `${col}/${row}`;
    let tile = this.tiles.get(key);
    if (tile) return tile;
    const corners = tileCorners(col, row);
    const [x, z] = corners[0];
    const mx = (corners[0][0] + corners[3][0]) / 2;
    const mz = (corners[0][1] + corners[3][1]) / 2;
    const side = tileSide(corners);
    // The map stops at the border: the model has nothing beyond it to stand on.
    let nigerian = false;
    for (let j = 0; j <= 2 && !nigerian; j++) {
      for (let i = 0; i <= 2 && !nigerian; i++) {
        const cell = this.grid.cellAt(x + (i / 2) * side, z + (j / 2) * side);
        nigerian = cell >= 0 && this.grid.isNigeria(cell);
      }
    }
    tile = {
      key,
      col,
      row,
      x,
      z,
      corners,
      mx,
      mz,
      half: side / 2,
      nigerian,
      state: { ground: "idle", buildings: "idle" },
      request: {},
      failedAt: { ground: 0, buildings: 0 },
      meshes: [],
      buildingMesh: null,
      show: { value: 0 },
      grow: { value: 0 },
      growTime: 0,
      labels: null,
      used: this.clock,
    };
    this.tiles.set(key, tile);
    return tile;
  }

  /** Tiles within a distance of a point, with how far away each is. */
  private around(cx: number, cz: number, reach: number): [Tile, number][] {
    const [col, row] = tileAt(cx, cz);
    const span = Math.ceil(reach / TILE_KM);
    const found: [Tile, number][] = [];
    for (let j = row - span; j <= row + span; j++) {
      for (let i = col - span; i <= col + span; i++) {
        const tile = this.tile(i, j);
        const dx = Math.max(Math.abs(tile.mx - cx) - tile.half, 0);
        const dz = Math.max(Math.abs(tile.mz - cz) - tile.half, 0);
        const distance = Math.hypot(dx, dz);
        if (distance < reach && tile.nigerian) found.push([tile, distance]);
      }
    }
    return found;
  }

  // ------------------------------------------------------------- worker --

  private send(tile: Tile, part: StreetPart): void {
    if (!this.worker) {
      this.worker = new Worker(new URL("./street.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (event) => this.receive(event.data as StreetResponse);
      this.worker.onerror = () => {
        // The worker itself broke. Everything it was doing has failed.
        for (const { tile, part } of this.pending.values()) {
          tile.state[part] = "failed";
          tile.failedAt[part] = performance.now();
          delete tile.request[part];
        }
        this.pending.clear();
        this.redraw();
      };
    }
    const id = this.nextId++;
    tile.state[part] = "loading";
    tile.request[part] = id;
    this.pending.set(id, { tile, part });
    const request: StreetRequest = {
      id,
      part,
      col: tile.col,
      row: tile.row,
      density: this.grid.density(tile.mx, tile.mz),
      lite: this.lite,
    };
    this.worker.postMessage(request);
  }

  private cancel(tile: Tile, part: StreetPart): void {
    const id = tile.request[part];
    if (id === undefined) return;
    this.worker?.postMessage({ cancel: id });
    this.pending.delete(id);
    delete tile.request[part];
    tile.state[part] = "idle";
  }

  private receive(response: StreetResponse): void {
    const waiting = this.pending.get(response.id);
    if (!waiting) return; // cancelled, or thrown away meanwhile
    this.pending.delete(response.id);
    const { tile, part } = waiting;
    delete tile.request[part];

    if (!response.ok) {
      tile.state[part] = "failed";
      tile.failedAt[part] = performance.now();
    } else if (response.part === "ground") {
      tile.state.ground = "ready";
      if (response.ground) this.addGround(tile, response.ground);
      if (response.trees) this.addSolid(tile, response.trees, tile.show, "trees");
      if (response.lamps) this.addLamps(tile, response.lamps);
      this.traffic.add(tile.key, tile.x, tile.z, response.routes);
      if (response.labels.length) {
        const specs: LabelSpec[] = response.labels.map((label, index) => ({
          id: `street:${tile.key}:${index}`,
          text: label.text,
          kind: label.kind,
          x: tile.x + label.x,
          y: 0,
          z: tile.z + label.z,
          rank: label.rank,
          minDistance: 0,
          maxDistance: label.reach,
          interactive: false,
          angle: label.angle,
        }));
        tile.labels = this.labels.add(specs);
      }
    } else {
      tile.state.buildings = "ready";
      if (response.buildings) {
        tile.buildingMesh = this.addSolid(tile, response.buildings, tile.grow, "buildings");
      }
    }
    this.redraw();
  }

  // ------------------------------------------------------------- meshes --

  /** Put a mesh on its tile's corner and keep it with the tile. */
  private attach(tile: Tile, mesh: THREE.Mesh, layer: Layer): THREE.Mesh {
    mesh.position.set(tile.x, 0, tile.z);
    mesh.updateMatrixWorld();
    mesh.matrixAutoUpdate = false;
    mesh.userData.layer = layer;
    tile.meshes.push(mesh);
    this.group.add(mesh);
    return mesh;
  }

  private addLamps(tile: Tile, lamps: Float32Array): void {
    const { posts, pools } = lampMeshes(lamps, {
      ...this.shared,
      ...this.uniforms,
      uShow: tile.show,
    });
    this.attach(tile, posts, "lamps");
    this.attach(tile, pools, "lamplight");
  }

  private addGround(tile: Tile, data: GroundMesh): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 2).onUpload(release));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(data.colours, 4, true).onUpload(release));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1).onUpload(release));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(tile.half, 0, tile.half), tile.half * 2);
    const [nw, ne, sw, se] = tile.corners;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...this.shared,
        ...this.uniforms,
        uShow: tile.show,
        uEast: { value: new THREE.Vector2(ne[0] - nw[0], ne[1] - nw[1]) },
        uSouth: { value: new THREE.Vector2(sw[0] - nw[0], sw[1] - nw[1]) },
        uTwist: { value: new THREE.Vector2(se[0] - ne[0] - sw[0] + nw[0], se[1] - ne[1] - sw[1] + nw[1]) },
      },
      vertexShader: GROUND_VERTEX,
      fragmentShader: GROUND_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    this.attach(tile, mesh, "ground");
  }

  private addSolid(tile: Tile, data: SolidMesh, grow: { value: number }, layer: Layer): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3).onUpload(release));
    geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3, true).onUpload(release));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(data.colours, 4, true).onUpload(release));
    geometry.setAttribute("aAlong", new THREE.BufferAttribute(data.along, 1).onUpload(release));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1).onUpload(release));
    // A building belongs to the tile its first corner is in, and may
    // reach well into the next one.
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(tile.half, 0.05, tile.half),
      tile.half * 2.6,
    );
    const material = new THREE.ShaderMaterial({
      uniforms: { ...this.shared, ...this.uniforms, uGrow: grow },
      vertexShader: SOLID_VERTEX,
      fragmentShader: SOLID_FRAGMENT,
      side: THREE.DoubleSide,
    });
    return this.attach(tile, new THREE.Mesh(geometry, material), layer);
  }

  private dropMesh(tile: Tile, mesh: THREE.Mesh): void {
    this.group.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    tile.meshes = tile.meshes.filter((other) => other !== mesh);
  }

  private dropBuildings(tile: Tile): void {
    this.cancel(tile, "buildings");
    if (tile.buildingMesh) this.dropMesh(tile, tile.buildingMesh);
    tile.buildingMesh = null;
    tile.state.buildings = "idle";
    tile.grow.value = 0;
    tile.growTime = 0;
  }

  private dropTile(tile: Tile): void {
    this.cancel(tile, "ground");
    this.dropBuildings(tile);
    for (const mesh of [...tile.meshes]) this.dropMesh(tile, mesh);
    this.traffic.remove(tile.key);
    tile.labels?.remove();
    this.tiles.delete(tile.key);
  }

  // --------------------------------------------------------------- loop --

  /**
   * Called for every frame that is drawn.
   * @param goal Where the camera is heading, so tiles are there on arrival.
   * @returns Whether something is still fading in and wants another frame.
   */
  update(view: View, goal: View, dt: number): boolean {
    const now = performance.now();
    this.clock++;
    const u = this.uniforms;
    const street = 1 - smoothstep(GROUND_FADE[0], GROUND_FADE[1], view.dist);
    const build = 1 - smoothstep(BUILD_FADE[0], BUILD_FADE[1], view.dist);
    u.uStreet.value = street;
    u.uBuild.value = build;
    const [fx, fz] = this.focus(view);
    u.uFocus.value.set(fx, fz);
    u.uGroundReach.value = this.groundReach(view.dist);
    u.uBuildReach.value = this.buildReach(view.dist);
    u.uLampSize.value = figureSize(view.dist);
    this.group.visible = street > 0;
    // The streets empty after dark.
    const daylight = smoothstep(-0.1, 0.14, this.shared.uSunDir.value.y);
    this.strolling = street > 0 && this.traffic.update(fx, fz, view.dist, dt, daylight);

    // ---- what is needed, for where the camera is and where it is going
    const wanted = new Map<string, { tile: Tile; part: StreetPart; distance: number }>();
    const want = (v: View, urgency: number) => {
      const [cx, cz] = this.focus(v);
      const collect = (part: StreetPart, reach: number, bonus: number) => {
        for (const [tile, distance] of this.around(cx, cz, reach)) {
          const key = `${part}:${tile.key}`;
          const score = distance + bonus + urgency;
          const known = wanted.get(key);
          if (!known || score < known.distance) {
            wanted.set(key, { tile, part, distance: score });
          }
          tile.used = this.clock;
        }
      };
      if (v.dist < GROUND_FROM) collect("ground", this.groundReach(v.dist), 0);
      // The ground comes first: a building with no street under it is lost.
      if (v.dist < BUILD_FROM) collect("buildings", this.buildReach(v.dist), 0.6);
    };
    want(view, 0);
    const travelling =
      Math.hypot(goal.x - view.x, goal.z - view.z) > 0.2 || Math.abs(Math.log(goal.dist / view.dist)) > 0.05;
    if (travelling) want(goal, view.dist < GROUND_FROM ? 1 : 0);

    // ---- stop what is no longer needed, start what is
    for (const { tile, part } of [...this.pending.values()]) {
      if (!wanted.has(`${part}:${tile.key}`)) this.cancel(tile, part);
    }
    const queue = [...wanted.values()]
      .filter(({ tile, part }) => {
        const state = tile.state[part];
        return state === "idle" || (state === "failed" && now - tile.failedAt[part] > RETRY_AFTER);
      })
      .sort((a, b) => a.distance - b.distance);
    for (const { tile, part } of queue) {
      if (this.pending.size >= MAX_REQUESTS) break;
      this.send(tile, part);
    }

    // ---- fade in what has arrived, and hide what is out of reach
    let busy = false;
    const groundEdge = u.uGroundReach.value + TILE_KM * 0.75;
    const buildEdge = u.uBuildReach.value + TILE_KM * 1.4;
    for (const tile of this.tiles.values()) {
      if (!tile.meshes.length) continue;
      const away = Math.hypot(tile.mx - fx, tile.mz - fz);
      const inReach = street > 0 && away < groundEdge;
      if (inReach && tile.show.value < 1) {
        tile.show.value = Math.min(1, tile.show.value + dt / 0.4);
        busy = true;
      }
      if (inReach && tile.buildingMesh && tile.growTime < 1 && build > 0) {
        tile.growTime = Math.min(1, tile.growTime + dt / 0.9);
        tile.grow.value = 1 - (1 - tile.growTime) ** 3;
        busy = true;
      }
      const built = build > 0 && away < buildEdge;
      for (const mesh of tile.meshes) {
        const layer: Layer = mesh.userData.layer;
        mesh.visible =
          layer === "ground"
            ? inReach && !this.photo
            : layer === "trees"
              ? inReach
              : layer === "lamplight"
                ? built && daylight < 1
                : built;
      }
      tile.labels?.setVisible(inReach);
    }

    // ---- throw away the tiles that were needed longest ago
    this.trim();

    // ---- tell the page
    let loading = false;
    let failed = false;
    for (const { tile, part } of wanted.values()) {
      const state = tile.state[part];
      if (state === "loading" || state === "idle") loading = true;
      if (state === "failed") failed = true;
    }
    // A failure only counts once nothing more is on its way.
    const status: StreetStatus = {
      visible: street > 0,
      loading: loading && view.dist < GROUND_FROM,
      failed: failed && !loading,
    };
    if (
      status.visible !== this.status.visible ||
      status.loading !== this.status.loading ||
      status.failed !== this.status.failed
    ) {
      this.status = status;
      this.onStatus(status);
    }
    // While something failed, keep looking so the retry happens.
    return busy || (failed && view.dist < GROUND_FROM);
  }

  private trim(): void {
    const loaded = [...this.tiles.values()];
    const withBuildings = loaded
      .filter((tile) => tile.state.buildings === "ready" && tile.used < this.clock)
      .sort((a, b) => a.used - b.used);
    let over = loaded.filter((tile) => tile.state.buildings === "ready").length - this.buildingLimit;
    for (const tile of withBuildings) {
      if (over-- <= 0) break;
      this.dropBuildings(tile);
    }
    const idle = loaded.filter((tile) => tile.used < this.clock).sort((a, b) => a.used - b.used);
    over = loaded.length - this.groundLimit;
    for (const tile of idle) {
      if (over-- <= 0) break;
      this.dropTile(tile);
    }
  }

  getStatus(): StreetStatus {
    return { ...this.status };
  }

  /** Forget everything, for example after the graphics context was lost. */
  reset(): void {
    for (const tile of [...this.tiles.values()]) this.dropTile(tile);
    this.pending.clear();
  }

  dispose(): void {
    this.reset();
    this.traffic.dispose();
    this.worker?.terminate();
    this.worker = null;
  }
}
