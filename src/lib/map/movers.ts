// Life on the streets. Once the camera is close enough to make them out,
// people walk, okadas weave, cars drive and trains run around it.
//
// They are made up: no data says who is where. They follow the centre
// lines of the roads and railways in OpenStreetMap (see street.worker.ts),
// keeping to their side of it. There are more of them where more people
// live, and fewer after dark. The intercity trains run the same way on the
// national lines (rail.ts), from much further out.
//
// One class moves and draws every kind. What differs between a walker and
// a train is its shape, its speed and how many there are: see KINDS.

import * as THREE from "three";
import { CARRIAGE_PITCH, car, okada, train, walker } from "./figures";
import { clamp, smoothstep } from "./math";
import type { MoverKey, RouteLines } from "./street-tiles";
import { FOG_GLSL, LIGHTING_GLSL, hex, type RGB } from "./style";
import type { SharedUniforms } from "./terrain";

const TAU = Math.PI * 2;

/**
 * From further up everything on the street is drawn larger than life, or
 * it would be specks. The street lamps grow with it (see streets.ts).
 */
export function figureSize(dist: number): number {
  return clamp(dist / 0.24, 1.15, 3.2);
}

/** Residents per km², and the ground height (scene km, full relief), at a spot. */
export interface Surroundings {
  density(x: number, z: number): number;
  groundAt(x: number, z: number): number;
}

export interface MoverKind {
  figure: () => THREE.InstancedBufferGeometry;
  /** Coats, or paint. */
  colours: RGB[];
  /** How many can be out at once: on a computer, and on a phone. */
  capacity: [desktop: number, phone: number];
  /** Kilometres of route per figure, in a busy part of town. */
  spacing: number;
  /** Slowest and fastest, km per second. */
  speed: [number, number];
  /** Share that stands still: people stop to talk. */
  idle: number;
  /** Distance covered in one swing of the legs, km. Zero for wheels only. */
  stride: number;
  /** Camera distances (km) between which the figures fade in. */
  fade: [number, number];
  /** And between which they fade out again closer in, if they do. */
  fadeNear?: [number, number];
  /** How far from the middle of the view they appear, km: least and most. */
  reach: [number, number];
  /** How much heights differ from one figure to the next. */
  vary: number;
  /** How busy a route is for the residents per km² around it and its own weight. */
  crowd: (density: number, busy: number) => number;
  /** Share still out in the middle of the night. */
  night: number;
  /**
   * How much of the larger-than-life size the figures take (see
   * figureSize). A train is large enough as it is.
   */
  oversize: number;
  /** A size of its own for the camera distance, in place of figureSize. */
  size?: (dist: number) => number;
  /** Figures that run nose to tail as one, and metres from one to the next. */
  coupled?: { count: number; pitch: number };
}

// Ankara prints and agbada: brighter than a European street.
const COATS = [
  "#f2f0ea",
  "#1d2b3a",
  "#c0392b",
  "#e0a526",
  "#2f6b4f",
  "#3d5fa0",
  "#e06f2a",
  "#8c3f5a",
  "#5b2c83",
  "#16a085",
  "#d35400",
  "#f2f0ea",
  "#2e2e33",
  "#b5651d",
  "#1f7a8c",
  "#d4ac0d",
].map(hex);
// Lagos taxis and danfo buses are yellow; everything else is mostly silver,
// white and black.
const PAINT = [
  "#f2c230",
  "#f2c230",
  "#e8b820",
  "#d7dde2",
  "#c9c2b2",
  "#1d2b3a",
  "#2e2e33",
  "#a33a2f",
  "#3d5fa0",
  "#54606b",
  "#d7dde2",
  "#f2f0ea",
].map(hex);
/** The green and white of the standard-gauge trains, and the blue of the Lagos metro. */
const LIVERIES = ["#2f7d4f", "#2f7d4f", "#e6e4dc", "#2d5fa8"].map(hex);

const KINDS: Record<MoverKey, MoverKind> = {
  walks: {
    figure: walker,
    colours: COATS,
    capacity: [1000, 360],
    spacing: 0.016,
    // About 5 km an hour.
    speed: [1.05 / 1000, 1.6 / 1000],
    idle: 0.1,
    stride: 0.0014,
    fade: [1.25, 1.6],
    reach: [0.22, 0.8],
    vary: 0.2,
    // A footpath always has some company: markets and campuses have few residents.
    crowd: (density, busy) => clamp(Math.sqrt(density / 6400), busy > 2 ? 0.45 : 0.2, 1),
    night: 0.2,
    oversize: 1,
  },
  rides: {
    figure: okada,
    colours: COATS,
    capacity: [360, 120],
    spacing: 0.03,
    // About 30 km an hour, weaving.
    speed: [6 / 1000, 10 / 1000],
    idle: 0,
    stride: 0,
    fade: [1.3, 1.8],
    reach: [0.25, 0.95],
    vary: 0.1,
    crowd: (density) => clamp(Math.sqrt(density / 5600), 0.3, 1),
    night: 0.25,
    oversize: 1,
  },
  drives: {
    figure: car,
    colours: PAINT,
    capacity: [300, 100],
    spacing: 0.04,
    // About 35 km an hour: this is town traffic.
    speed: [7 / 1000, 13 / 1000],
    idle: 0,
    stride: 0,
    fade: [1.35, 2],
    reach: [0.28, 1.1],
    vary: 0,
    crowd: (density) => clamp(Math.sqrt(density / 5600), 0.25, 1),
    night: 0.25,
    oversize: 1,
  },
  rails: {
    figure: train,
    colours: LIVERIES,
    capacity: [32, 16],
    // Per carriage: a train every two kilometres of track or so.
    spacing: 0.5,
    // About 60 km an hour in town.
    speed: [14 / 1000, 20 / 1000],
    idle: 0,
    stride: 0,
    fade: [1.35, 2],
    reach: [0.28, 1.1],
    vary: 0,
    // Trains keep to their timetable wherever they are.
    crowd: () => 1,
    night: 0.55,
    oversize: 0.25,
    coupled: { count: 4, pitch: CARRIAGE_PITCH },
  },
};

/**
 * The trains on the national lines (rail.ts), seen from a whole region
 * away: fewer and faster, and drawn larger the further the camera is, or
 * a train would be lost from 100 km. The street-level trains take over
 * close in.
 */
export const INTERCITY: MoverKind = {
  figure: train,
  colours: LIVERIES,
  capacity: [36, 18],
  // Per carriage: a train every 30 km of line.
  spacing: 5,
  // 90 to 120 km an hour.
  speed: [25 / 1000, 33 / 1000],
  idle: 0,
  stride: 0,
  fade: [500, 900],
  fadeNear: [3, 6],
  reach: [12, 1200],
  vary: 0,
  crowd: () => 1,
  night: 0.5,
  oversize: 1,
  size: (dist) => clamp(dist * 0.12, 1, 80),
  coupled: { count: 6, pitch: CARRIAGE_PITCH },
};

const VERTEX = /* glsl */ `
attribute vec3 aPart;   // hinge height in metres, which way it swings, what it is made of
attribute vec4 aMove;   // x and z in km from the mesh, heading, point in the stride
attribute float aGrow;
attribute float aHeight; // ground under the figure, scene km at full relief
attribute vec4 aLook;   // colour of the coat or the paint, and a number for the rest
uniform float uLift;
uniform float uRelief;
uniform float uShow;
uniform float uSize;
uniform float uVary;
uniform float uReach;
uniform vec2 uFocus;
varying vec3 vAlbedo;
varying vec3 vGlow;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vShow;
${LIGHTING_GLSL}
void main() {
  // Legs and arms swing from the hip and the shoulder.
  float swing = aPart.y * 0.6 * sin(aMove.w);
  float c = cos(swing);
  float s = sin(swing);
  float below = position.y - aPart.x;
  vec3 p = vec3(position.x, aPart.x + below * c - position.z * s, below * s + position.z * c);
  // The figure faces along +z until it is turned to its heading.
  float ch = cos(aMove.z);
  float sh = sin(aMove.z);
  p = vec3(p.x * ch + p.z * sh, p.y, -p.x * sh + p.z * ch);
  vNormal = vec3(normal.x * ch + normal.z * sh, normal.y, -normal.x * sh + normal.z * ch);

  vec4 foot = modelMatrix * vec4(aMove.x, 0.0, aMove.y, 1.0);
  float near = 1.0 - smoothstep(uReach * 0.82, uReach, distance(foot.xz, uFocus));
  vShow = aGrow * near * uShow;
  float seed = aLook.a;
  float tall = 1.0 + uVary * (seed - 0.5);
  vec3 local = vec3(aMove.x, uLift + aHeight * uRelief, aMove.y) + p * (0.001 * uSize * tall * vShow);

  float night = 1.0 - dayAmount(vec3(0.0, 1.0, 0.0));
  float material = aPart.z;
  vec3 colour;
  vGlow = vec3(0.0);
  if (material < 0.5) {
    colour = mix(vec3(0.07, 0.09, 0.16), vec3(0.34, 0.32, 0.29), fract(seed * 5.3));
  } else if (material < 1.5) {
    colour = aLook.rgb;
  } else if (material < 2.5) {
    colour = mix(vec3(0.42, 0.27, 0.17), vec3(0.17, 0.10, 0.06), fract(seed * 9.7));
  } else if (material < 3.5) {
    colour = mix(vec3(0.03, 0.025, 0.02), vec3(0.12, 0.08, 0.05), fract(seed * 3.1));
  } else if (material < 4.5) {
    colour = vec3(0.1, 0.1, 0.11);
  } else if (material < 5.5) {
    colour = vec3(0.17, 0.23, 0.29);
    // Lit windows after dark.
    vGlow = vec3(1.0, 0.8, 0.5) * night * 0.12;
  } else if (material < 6.5) {
    colour = vec3(0.95, 0.93, 0.85);
    vGlow = vec3(1.0, 0.94, 0.75) * night * 1.3;
  } else {
    colour = vec3(0.62, 0.08, 0.06);
    vGlow = vec3(1.0, 0.12, 0.06) * night;
  }
  vAlbedo = toLinear(colour);

  vWorld = (modelMatrix * vec4(local, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vAlbedo;
varying vec3 vGlow;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vShow;
${LIGHTING_GLSL}
${FOG_GLSL}
void main() {
  if (vShow < 0.01) discard;
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 colour = shade(vAlbedo, normalize(vNormal), up, 1.0);
  // Under the street lamps at night.
  colour += vAlbedo * vec3(1.0, 0.72, 0.4) * (1.0 - dayAmount(up)) * 0.3 + vGlow;
  gl_FragColor = vec4(toDisplay(applyFog(colour, vWorld)), 1.0);
}
`;

interface Join {
  route: Route;
  /** The route is entered at its first point; otherwise at its last. */
  fromStart: boolean;
}

/** One stretch of road, path or rail that can be followed. */
interface Route {
  /** x, z pairs, scene km. */
  points: Float64Array;
  /** Distance from the first point to each point, km. */
  at: Float64Array;
  length: number;
  /** How far from the centre line to keep, km. */
  offset: number;
  /** Figures per length, compared with an ordinary street in a busy area. */
  weight: number;
  /** The middle, for deciding whether the route is in reach. */
  mx: number;
  mz: number;
  /** Routes that meet this one at its first point, and at its last. */
  joins: [Join[], Join[]];
  /** Set once the tile it came from has been thrown away. */
  gone: boolean;
}

interface Mover {
  route: Route | null;
  /** Distance along the route, km. */
  s: number;
  /** 1 goes from the first point to the last, -1 the other way. */
  dir: number;
  /** Which side of the centre line, and how far out, as a share of the offset. */
  side: number;
  /** km per second. Zero for someone standing about. */
  speed: number;
  x: number;
  z: number;
  heading: number;
  phase: number;
  grow: number;
  /** On its way out: it shrinks away and starts again elsewhere. */
  leaving: boolean;
  /**
   * For the first of a coupled set: where it has been, as x, z pairs,
   * oldest first. The rest of the set follow along it.
   */
  trail: number[];
}

/** How far apart the points of a trail lie, km. */
const TRAIL_STEP = 0.003;

/** The difference between two headings, between -pi and pi. */
function turnTo(from: number, to: number): number {
  return ((((to - from) % TAU) + TAU * 1.5) % TAU) - Math.PI;
}

export class Movers {
  readonly mesh: THREE.Mesh;

  private capacity: number;
  private tiles = new Map<string, Route[]>();
  private movers: Mover[] = [];
  private move: THREE.InstancedBufferAttribute;
  private grow: THREE.InstancedBufferAttribute;
  private height: THREE.InstancedBufferAttribute;
  private uniforms = {
    uShow: { value: 0 },
    uSize: { value: 1 },
    uVary: { value: 0 },
    uReach: { value: 1 },
    uFocus: { value: new THREE.Vector2() },
  };

  /** The routes within reach, and the running total of their weights. */
  private pool: Route[] = [];
  private poolSums: number[] = [];
  private poolAt: [number, number, number] = [Infinity, Infinity, 0];
  private stale = true;

  constructor(
    private kind: MoverKind,
    private around: Surroundings,
    shared: SharedUniforms,
    phone: boolean,
    /** The visitor asked for less motion: everything stands where it is. */
    private still: boolean,
  ) {
    const capacity = (this.capacity = kind.capacity[phone ? 1 : 0]);
    const geometry = kind.figure();
    this.move = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.grow = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.height = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.move.setUsage(THREE.DynamicDrawUsage);
    this.grow.setUsage(THREE.DynamicDrawUsage);
    this.height.setUsage(THREE.DynamicDrawUsage);
    const look = new Uint8Array(capacity * 4);
    const coupled = kind.coupled?.count ?? 1;
    for (let i = 0; i < capacity; i++) {
      // A coupled set is all of one colour.
      if (i % coupled) look.copyWithin(i * 4, (i - 1) * 4, i * 4);
      else {
        const colour = kind.colours[Math.floor(Math.random() * kind.colours.length)];
        look.set([colour[0], colour[1], colour[2], Math.floor(Math.random() * 256)], i * 4);
      }
      this.movers.push({
        route: null,
        s: 0,
        dir: 1,
        side: 1,
        speed: 0,
        x: 0,
        z: 0,
        heading: 0,
        phase: 0,
        grow: 0,
        leaving: false,
        trail: [],
      });
    }
    geometry.setAttribute("aMove", this.move);
    geometry.setAttribute("aGrow", this.grow);
    geometry.setAttribute("aHeight", this.height);
    geometry.setAttribute("aLook", new THREE.InstancedBufferAttribute(look, 4, true));
    geometry.instanceCount = capacity;
    this.uniforms.uVary.value = kind.vary;

    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { ...shared, ...this.uniforms },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        side: THREE.DoubleSide,
      }),
    );
    // The figures are placed by the shader, so the mesh has no size of its own.
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Take in the lines of a tile whose corner is at x, z. */
  add(key: string, x: number, z: number, lines: RouteLines): void {
    const routes: Route[] = [];
    const ends = new Map<string, Join[]>();
    const meet = (px: number, pz: number, join: Join) => {
      const spot = `${Math.round(px * 20000)},${Math.round(pz * 20000)}`;
      const known = ends.get(spot);
      if (known) known.push(join);
      else ends.set(spot, [join]);
      return spot;
    };
    const spots: [string, string][] = [];

    for (let i = 0; i < lines.length;) {
      const count = lines[i];
      const offset = lines[i + 1];
      const busy = lines[i + 2];
      const points = new Float64Array(count * 2);
      const at = new Float64Array(count);
      for (let k = 0; k < count; k++) {
        points[k * 2] = x + lines[i + 3 + k * 2];
        points[k * 2 + 1] = z + lines[i + 4 + k * 2];
        if (k) {
          at[k] =
            at[k - 1] + Math.hypot(points[k * 2] - points[k * 2 - 2], points[k * 2 + 1] - points[k * 2 - 1]);
        }
      }
      i += 3 + count * 2;
      const length = at[count - 1];
      if (!(length > 0)) continue;

      const mx = (points[0] + points[count * 2 - 2]) / 2;
      const mz = (points[1] + points[count * 2 - 1]) / 2;
      // Streets are busier where more people live.
      const route: Route = {
        points,
        at,
        length,
        offset,
        weight: busy * this.kind.crowd(this.around.density(mx, mz), busy),
        mx,
        mz,
        joins: [[], []],
        gone: false,
      };
      routes.push(route);
      spots.push([
        meet(points[0], points[1], { route, fromStart: true }),
        meet(points[count * 2 - 2], points[count * 2 - 1], { route, fromStart: false }),
      ]);
    }
    routes.forEach((route, k) => {
      route.joins = [
        (ends.get(spots[k][0]) ?? []).filter((join) => join.route !== route),
        (ends.get(spots[k][1]) ?? []).filter((join) => join.route !== route),
      ];
    });
    this.tiles.set(key, routes);
    this.stale = true;
  }

  remove(key: string): void {
    for (const route of this.tiles.get(key) ?? []) route.gone = true;
    if (this.tiles.delete(key)) this.stale = true;
  }

  /** The routes around a point, for choosing where a figure appears. */
  private gather(fx: number, fz: number, reach: number): void {
    this.pool = [];
    this.poolSums = [];
    let sum = 0;
    for (const routes of this.tiles.values()) {
      for (const route of routes) {
        if (Math.hypot(route.mx - fx, route.mz - fz) > reach) continue;
        sum += route.length * route.weight;
        this.pool.push(route);
        this.poolSums.push(sum);
      }
    }
    this.poolAt = [fx, fz, reach];
    this.stale = false;
  }

  /** Put a figure somewhere on the routes in reach. */
  private place(mover: Mover): void {
    const total = this.poolSums[this.poolSums.length - 1];
    if (!total) return;
    const pick = Math.random() * total;
    let low = 0;
    let high = this.poolSums.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.poolSums[mid] < pick) low = mid + 1;
      else high = mid;
    }
    const route = this.pool[low];
    const [slow, fast] = this.kind.speed;
    mover.route = route;
    mover.s = Math.random() * route.length;
    mover.dir = Math.random() < 0.5 ? 1 : -1;
    mover.side = (Math.random() < 0.5 ? 1 : -1) * (0.8 + 0.4 * Math.random());
    mover.speed = Math.random() < this.kind.idle ? 0 : slow + (fast - slow) * Math.random();
    mover.phase = mover.speed ? Math.random() * TAU : 0;
    mover.grow = this.still ? 1 : 0;
    mover.leaving = false;
    const [x, z, dx, dz] = this.spot(mover, route);
    mover.x = x;
    mover.z = z;
    mover.heading = mover.speed ? Math.atan2(dx * mover.dir, dz * mover.dir) : Math.random() * TAU;
    // What is coupled on behind starts out in a straight line.
    mover.trail = [];
    if (!this.kind.coupled) return;
    const { count, pitch } = this.kind.coupled;
    for (let k = Math.ceil((count * pitch * 0.004) / TRAIL_STEP); k >= 0; k--) {
      mover.trail.push(
        x - Math.sin(mover.heading) * k * TRAIL_STEP,
        z - Math.cos(mover.heading) * k * TRAIL_STEP,
      );
    }
  }

  /** Of the routes that meet at a corner, the one that bends least. */
  private straightest(joins: Join[], heading: number): Join {
    let best = joins[0];
    let least = Infinity;
    for (const join of joins) {
      const { points } = join.route;
      const k = join.fromStart ? 0 : points.length - 4;
      const sign = join.fromStart ? 1 : -1;
      const bend = Math.abs(
        turnTo(
          heading,
          Math.atan2((points[k + 2] - points[k]) * sign, (points[k + 3] - points[k + 1]) * sign),
        ),
      );
      if (bend < least) {
        least = bend;
        best = join;
      }
    }
    return best;
  }

  /** Put a figure a distance back along the way the first of its set has come. */
  private follow(mover: Mover, lead: Mover, back: number): void {
    const { trail } = lead;
    let nx = lead.x;
    let nz = lead.z;
    for (let k = trail.length - 2; k >= 0; k -= 2) {
      const step = Math.hypot(nx - trail[k], nz - trail[k + 1]);
      if (step >= back || k === 0) {
        const t = step ? Math.min(1, back / step) : 0;
        mover.x = nx + (trail[k] - nx) * t;
        mover.z = nz + (trail[k + 1] - nz) * t;
        if (step > 1e-7) mover.heading = Math.atan2(nx - trail[k], nz - trail[k + 1]);
        return;
      }
      back -= step;
      nx = trail[k];
      nz = trail[k + 1];
    }
  }

  /** Where on the ground a figure's place on its route is, and which way the route runs there. */
  private spot(mover: Mover, route: Route): [x: number, z: number, dx: number, dz: number] {
    const { points, at } = route;
    let k = 1;
    while (k < at.length - 1 && at[k] < mover.s) k++;
    const span = at[k] - at[k - 1] || 1;
    const t = clamp((mover.s - at[k - 1]) / span, 0, 1);
    const ax = points[k * 2 - 2];
    const az = points[k * 2 - 1];
    const dx = (points[k * 2] - ax) / span;
    const dz = (points[k * 2 + 1] - az) / span;
    const out = route.offset * mover.side;
    return [ax + (points[k * 2] - ax) * t - dz * out, az + (points[k * 2 + 1] - az) * t + dx * out, dx, dz];
  }

  /**
   * Move everything on by dt seconds.
   * @param daylight 0 at night, 1 by day. The streets empty after dark.
   * @returns Whether anything is moving, so the map keeps drawing.
   */
  update(fx: number, fz: number, dist: number, dt: number, daylight: number, enabled: boolean): boolean {
    const { kind, capacity } = this;
    const near = kind.fadeNear ? smoothstep(kind.fadeNear[0], kind.fadeNear[1], dist) : 1;
    const show = enabled ? (1 - smoothstep(kind.fade[0], kind.fade[1], dist)) * near : 0;
    this.mesh.visible = show > 0;
    if (!this.mesh.visible) return false;

    const reach = clamp(dist * 0.88, kind.reach[0], kind.reach[1]);
    const u = this.uniforms;
    u.uShow.value = show;
    const size = (u.uSize.value = kind.size ? kind.size(dist) : 1 + (figureSize(dist) - 1) * kind.oversize);
    u.uReach.value = reach;
    u.uFocus.value.set(fx, fz);

    // Positions are sent relative to the mesh, which keeps them precise.
    const origin = this.mesh.position;
    if (Math.hypot(origin.x - fx, origin.z - fz) > Math.max(3, reach)) {
      origin.set(Math.round(fx), 0, Math.round(fz));
      this.mesh.updateMatrixWorld();
    }

    const [px, pz, pr] = this.poolAt;
    if (this.stale || Math.hypot(px - fx, pz - fz) > reach * 0.12 || Math.abs(pr - reach) > reach * 0.08) {
      this.gather(fx, fz, reach);
    }
    const total = this.poolSums[this.poolSums.length - 1] ?? 0;
    const coupled = kind.coupled?.count ?? 1;
    const pitch = (kind.coupled?.pitch ?? 0) * 0.001 * size;
    // Whole sets only.
    const wanted =
      Math.floor(
        Math.min(capacity, Math.round((total / kind.spacing) * (kind.night + (1 - kind.night) * daylight))) /
          coupled,
      ) * coupled;

    const ease = 1 - Math.exp(-dt * 5);
    const turn = 1 - Math.exp(-dt * 8);
    const move = this.move.array as Float32Array;
    const grow = this.grow.array as Float32Array;
    const height = this.height.array as Float32Array;
    let moving = false;

    for (let i = 0; i < capacity; i++) {
      const m = this.movers[i];
      if (i % coupled) {
        // Coupled on behind the first of its set.
        const lead = this.movers[i - (i % coupled)];
        if (lead.route) this.follow(m, lead, (i % coupled) * pitch);
        move[i * 4] = m.x - origin.x;
        move[i * 4 + 1] = m.z - origin.z;
        move[i * 4 + 2] = m.heading;
        grow[i] = lead.route ? lead.grow : 0;
        height[i] = this.around.groundAt(m.x, m.z);
        continue;
      }
      const keep = i < wanted && !m.leaving;
      if (m.route && (m.route.gone || Math.hypot(m.x - fx, m.z - fz) > reach)) {
        m.route = null;
      }
      if (!m.route && keep) this.place(m);
      if (!m.route) {
        grow[i] = 0;
        continue;
      }

      if (keep) {
        if (m.grow < 1) moving ||= !this.still;
        m.grow = Math.min(1, m.grow + dt / 0.6);
      } else {
        m.grow -= dt / 0.6;
        if (m.grow <= 0 || this.still) {
          m.route = null;
          m.leaving = false;
          grow[i] = 0;
          continue;
        }
      }

      if (m.speed && !this.still) {
        moving = true;
        m.s += m.dir * m.speed * dt;
        if (kind.stride) m.phase = (m.phase + ((m.speed * dt) / kind.stride) * TAU) % TAU;
        let route: Route = m.route;
        if (m.s > route.length || m.s < 0) {
          // At a corner: carry on down one of the routes that meet here,
          // or now and then turn back.
          const joins = route.joins[m.s < 0 ? 0 : 1].filter((join) => !join.route.gone);
          if (kind.coupled && !joins.length) {
            // A train does not turn round on the spot: it leaves.
            m.leaving = true;
            m.s = clamp(m.s, 0, route.length);
          } else if (joins.length && (kind.coupled || Math.random() < 0.9)) {
            const next = kind.coupled
              ? this.straightest(joins, m.heading)
              : joins[Math.floor(Math.random() * joins.length)];
            const side = m.side * m.dir;
            route = m.route = next.route;
            m.dir = next.fromStart ? 1 : -1;
            m.s = next.fromStart ? 0 : route.length;
            // Stay on the same hand of the street.
            m.side = side * m.dir;
          } else {
            m.dir = -m.dir;
            m.s = clamp(m.s, 0, route.length);
          }
        }
        const [tx, tz] = this.spot(m, route);
        const dx = tx - m.x;
        const dz = tz - m.z;
        // The figure follows its place on the route a little behind, which
        // rounds off the corners.
        if (dx * dx + dz * dz > 1e-12) {
          m.heading += turnTo(m.heading, Math.atan2(dx, dz)) * turn;
        }
        m.x += dx * ease;
        m.z += dz * ease;
        if (kind.coupled) {
          const { trail } = m;
          const last = trail.length - 2;
          if (Math.hypot(m.x - trail[last], m.z - trail[last + 1]) > TRAIL_STEP) {
            trail.push(m.x, m.z);
            if (trail.length > 2 * Math.ceil((coupled * pitch) / TRAIL_STEP) + 8) trail.splice(0, 2);
          }
        }
      }

      move[i * 4] = m.x - origin.x;
      move[i * 4 + 1] = m.z - origin.z;
      move[i * 4 + 2] = m.heading;
      move[i * 4 + 3] = m.phase;
      grow[i] = m.grow;
      height[i] = this.around.groundAt(m.x, m.z);
    }
    this.move.needsUpdate = true;
    this.grow.needsUpdate = true;
    this.height.needsUpdate = true;
    return moving;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Everyone and everything on the move in the streets, of all four kinds. */
export class Traffic {
  readonly group = new THREE.Group();
  /** Switched off by the visitor. */
  enabled = true;

  private kinds: Record<MoverKey, Movers>;

  constructor(around: Surroundings, shared: SharedUniforms, phone: boolean, reducedMotion: boolean) {
    const make = (kind: MoverKind) => new Movers(kind, around, shared, phone, reducedMotion);
    this.kinds = {
      walks: make(KINDS.walks),
      rides: make(KINDS.rides),
      drives: make(KINDS.drives),
      rails: make(KINDS.rails),
    };
    for (const movers of Object.values(this.kinds)) this.group.add(movers.mesh);
  }

  /** Take in the routes of a tile whose corner is at x, z. */
  add(key: string, x: number, z: number, lines: Record<MoverKey, RouteLines | null>): void {
    for (const [kind, movers] of Object.entries(this.kinds)) {
      const routes = lines[kind as MoverKey];
      if (routes) movers.add(key, x, z, routes);
    }
  }

  remove(key: string): void {
    for (const movers of Object.values(this.kinds)) movers.remove(key);
  }

  /** @returns Whether anything is moving, so the map keeps drawing. */
  update(fx: number, fz: number, dist: number, dt: number, daylight: number): boolean {
    let moving = false;
    for (const movers of Object.values(this.kinds)) {
      if (movers.update(fx, fz, dist, dt, daylight, this.enabled)) moving = true;
    }
    return moving;
  }

  dispose(): void {
    for (const movers of Object.values(this.kinds)) movers.dispose();
  }
}
