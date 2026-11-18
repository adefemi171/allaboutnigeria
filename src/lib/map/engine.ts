// The map itself: one WebGL scene holding the globe, the voxel model of
// Nigeria and its streets, a camera that can travel from orbit down to a
// single street, and the controls to move it.

import * as THREE from "three";
import { sunDirection } from "@/lib/sun";
import { Aerial, type GroundMode } from "./aerial";
import { buildGlobe, type Globe } from "./globe";
import { Grid, loadGrid, type CellInfo } from "./grid";
import { Labels, type LabelGroup, type LabelKind, type LabelSpec } from "./labels";
import { clamp, smoothstep } from "./math";
import { mapPlaces, type MapPlace, type PlaceKind } from "./places";
import { EARTH_RADIUS_KM, ORIGIN, latLonToWorld } from "./projection";
import { Rail } from "./rail";
import { Streets, type StreetStatus } from "./streets";
import { BACKGROUND } from "./style";
import { buildTerrain, type SharedUniforms, type Terrain } from "./terrain";

export type { GroundMode };

/** Where the camera is, described the way a person would. */
export interface Pose {
  /** The point on the ground the camera looks at, scene km. */
  x: number;
  z: number;
  /** Distance from that point to the camera, km. */
  dist: number;
  /** Compass direction the camera faces, degrees. 0 looks north. */
  az: number;
  /** 0 looks straight down, 90 would be level with the ground. */
  tilt: number;
  /** Shift of the picture on screen, as a fraction of its width and height. */
  shiftX: number;
  shiftY: number;
}

export interface Picked {
  cell: CellInfo;
  /** Residents within 5 km. */
  nearby: number;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  labels: HTMLElement;
  /** Where grid.dat, grid.json and rail.geojson are. */
  dataUrl: string;
  /** Let the visitor drag, zoom and rotate. */
  interactive: boolean;
  pose: Pose;
  reducedMotion: boolean;
  /** A phone or a small tablet: fewer pixels, people and tiles. */
  lite: boolean;
}

const RAD = Math.PI / 180;
const FOV = 32;
const MIN_DIST = 0.1;
const MAX_DIST = 9000;
const MAX_TILT = 72;
const GLOBE_CENTRE = new THREE.Vector3(0, -EARTH_RADIUS_KM, 0);
/**
 * The model stretches heights a great deal, which no street could survive.
 * Between these camera distances (km) it settles down to flat ground.
 */
const RELIEF_GONE = 4.5;
const RELIEF_FULL = 40;
/** The view a visitor gets when asking for the streets of a place. */
const STREET_VIEW = { dist: 1.1, tilt: 60 };
/** The sea, the great rivers and the largest lake, named from afar. */
const WATERS: [name: string, lat: number, lon: number][] = [
  ["Gulf of Guinea", 4.9, 4.6],
  ["Niger", 8.9, 5.9],
  ["Benue", 7.95, 9.55],
  ["Kainji Lake", 10.35, 4.55],
];

export class MapEngine {
  grid!: Grid;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);
  private scratch = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);
  private shared: SharedUniforms;
  private terrain!: Terrain;
  private globe!: Globe;
  private labels!: Labels;
  private streets!: Streets;
  private aerial!: Aerial;
  private rail!: Rail;
  private marker: LabelGroup | null = null;
  /** Every place the map names, once the grid has ranked the cities. */
  places: MapPlace[] = [];

  private pose: Pose;
  private goal: Pose;
  /** How fast the camera closes on its goal. Higher is snappier. */
  private stiffness = 4;
  private width = 1;
  private height = 1;
  private overcastGoal = 0;
  /**
   * Height the camera looks at, scene km: the ground under the target,
   * smoothed and eased, so the view rides over a plateau instead of
   * sinking into it.
   */
  private rest = 0;
  private dirty = true;
  private onScreen = true;
  private disposed = false;
  /** A train on the national lines is moving. */
  private railMoving = false;
  private frame = 0;
  private hoverPending: [number, number] | null = null;
  private lastTime = 0;
  private lastDrawn = 0;
  /** Flips every frame while only the people on the streets are moving. */
  private held = false;
  private peopleShown = true;
  private disposers: (() => void)[] = [];

  private onHover: (picked: Picked | null) => void = () => {};
  private onPick: (picked: Picked | null) => void = () => {};
  private onSelect: (id: string) => void = () => {};
  private onMove: (pose: Pose) => void = () => {};
  private onStreets: (status: StreetStatus) => void = () => {};

  constructor(private options: EngineOptions) {
    this.pose = { ...options.pose };
    this.goal = { ...options.pose };

    // A phone's screen is dense enough to hide the jaggies; it has better
    // uses for the work antialiasing costs.
    const pixelRatio = Math.min(window.devicePixelRatio || 1, options.lite ? 1.5 : 2);
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: !options.lite || pixelRatio < 1.5,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(pixelRatio);

    // The far distance fades into the page background, so both use it.
    const fog = new THREE.Color().setRGB(
      BACKGROUND[0] / 255,
      BACKGROUND[1] / 255,
      BACKGROUND[2] / 255,
      THREE.SRGBColorSpace,
    );
    this.renderer.setClearColor(fog);
    this.shared = {
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
      uOvercast: { value: 0 },
      uFogColor: { value: fog },
      uFogNear: { value: 1e6 },
      uFogFar: { value: 2e6 },
      uRelief: { value: 1 },
      uLift: { value: 0 },
    };
  }

  async init(): Promise<void> {
    const { dataUrl, lite, reducedMotion } = this.options;
    const loading = new AbortController();
    this.disposers.push(() => loading.abort());
    const redraw = () => (this.dirty = true);
    this.grid = await loadGrid(dataUrl, loading.signal);
    if (this.disposed) return;
    const grid = this.grid;
    const extent = { x0: grid.x0, z0: grid.z0, x1: grid.xMax, z1: grid.zMax };
    this.globe = buildGlobe(this.shared, extent, lite, redraw);
    this.scene.add(this.globe.group);
    this.terrain = buildTerrain(this.grid, this.shared, lite);
    this.scene.add(this.terrain.group);

    this.places = mapPlaces((lat, lon) => this.grid.peopleWithin(...latLonToWorld(lat, lon), 10));
    this.labels = new Labels(this.options.labels, this.labelSpecs(), (id) => this.onSelect(id));
    const around = {
      density: (x: number, z: number) => this.grid.density(x, z),
      groundAt: (x: number, z: number) => this.terrain.groundAt(x, z),
    };
    this.streets = new Streets(
      this.grid,
      around,
      this.shared,
      this.labels,
      redraw,
      (status) => this.onStreets(status),
      lite,
      reducedMotion,
    );
    this.aerial = new Aerial(
      this.shared,
      extent,
      (x, z) => this.terrain.groundAt(x, z),
      lite ? 28 : 48,
      redraw,
    );
    this.rail = new Rail(this.shared, around, lite, reducedMotion);
    this.scene.add(this.streets.group, this.aerial.group, this.rail.group);
    // The railways are not needed to start with, and the map works without them.
    this.rail.load(`${dataUrl}/rail.geojson`, loading.signal).then(redraw, (error) => {
      if (!loading.signal.aborted) console.warn(error);
    });

    this.setDate(new Date());
    this.observeSize();
    if (this.options.interactive) this.bindControls();
    this.bindContext();

    this.lastTime = performance.now();
    const tick = (now: number) => {
      this.frame = requestAnimationFrame(tick);
      this.step(now);
    };
    this.frame = requestAnimationFrame(tick);
    this.disposers.push(() => cancelAnimationFrame(this.frame));
  }

  // ------------------------------------------------------------- public --

  on(event: "hover" | "pick", handler: (picked: Picked | null) => void): void;
  on(event: "select", handler: (id: string) => void): void;
  on(event: "move", handler: (pose: Pose) => void): void;
  on(event: "streets", handler: (status: StreetStatus) => void): void;
  on(event: string, handler: (value: never) => void): void {
    if (event === "hover") this.onHover = handler as typeof this.onHover;
    if (event === "pick") this.onPick = handler as typeof this.onPick;
    if (event === "select") this.onSelect = handler as typeof this.onSelect;
    if (event === "move") this.onMove = handler as typeof this.onMove;
    if (event === "streets") this.onStreets = handler as typeof this.onStreets;
  }

  /** Send the camera somewhere. Fields left out keep their current goal. */
  setGoal(pose: Partial<Pose>, speed = 4): void {
    Object.assign(this.goal, pose);
    this.stiffness = speed;
    if (this.options.reducedMotion) this.pose = { ...this.goal };
    this.dirty = true;
  }

  getGoal(): Pose {
    return { ...this.goal };
  }

  /** A good view of a named place. */
  private poseFor(place: MapPlace): Partial<Pose> {
    const [x, z] = latLonToWorld(place.lat, place.lon);
    // A single building is best seen from its street.
    if (place.streets) return { x, z, ...STREET_VIEW };
    const dist = place.kind === "city" ? 70 : place.kind === "university" ? 9 : 40;
    return { x, z, dist, tilt: 54 };
  }

  flyToPlace(place: MapPlace): void {
    this.setGoal(this.poseFor(place), 2.6);
  }

  /** Go down to the streets around a point (scene km). */
  flyToStreets(x: number, z: number): void {
    this.setGoal({ x, z, ...STREET_VIEW }, 2.2);
  }

  /** Put a named pin on a point (scene km), or take it away with null. */
  setMarker(marker: { x: number; z: number; text: string } | null): void {
    this.marker?.remove();
    this.marker = marker
      ? this.labels.add([
          {
            id: "marker",
            text: marker.text,
            kind: "pin",
            x: marker.x,
            y: 0,
            z: marker.z,
            rank: -1,
            minDistance: 0,
            maxDistance: 60,
            interactive: false,
          },
        ])
      : null;
    this.dirty = true;
  }

  /** Whether streets are showing, loading, or could not be loaded. */
  getStreets(): StreetStatus {
    return this.streets.getStatus();
  }

  setDate(date: Date): void {
    const [x, y, z] = sunDirection(date, ORIGIN.lat, ORIGIN.lon);
    this.shared.uSunDir.value.set(x, y, z);
    this.dirty = true;
  }

  /** 0 is a clear sky, 1 fully overcast. */
  setOvercast(amount: number): void {
    this.overcastGoal = amount;
    this.dirty = true;
  }

  /** Cover the land below a sea level (metres) with water. Null clears it. */
  setFlood(level: number | null): void {
    this.terrain.setFlood(level);
    this.dirty = true;
  }

  /** Show or hide all names of some kinds, such as the universities. */
  setLabelKinds(kinds: LabelKind[], shown: boolean): void {
    this.labels.setKinds(kinds, shown);
    this.dirty = true;
  }

  /** Show or hide the people, the traffic and the trains. */
  setPeople(shown: boolean): void {
    this.streets.setPeople(shown);
    this.peopleShown = shown;
  }

  /** Draw the ground as the atlas model, or with the satellite picture. */
  setGroundMode(mode: GroundMode): void {
    this.aerial.setMode(mode);
    this.terrain.setPhoto(mode !== "model");
    this.streets.setPhoto(mode !== "model");
    this.dirty = true;
  }

  dispose(): void {
    this.disposed = true;
    for (const dispose of this.disposers) dispose();
    this.aerial?.dispose();
    this.streets?.dispose();
    this.rail?.dispose();
    this.labels?.dispose();
    this.terrain?.dispose();
    this.globe?.dispose();
    this.renderer.dispose();
    // Browsers keep only a few contexts; do not wait for the garbage collector.
    this.renderer.forceContextLoss();
  }

  // ------------------------------------------------------------- labels --

  private labelSpecs(): LabelSpec[] {
    const grid = this.grid;
    const specs: LabelSpec[] = [];
    const heightAt = (x: number, z: number) => {
      const cell = grid.cellAt(x, z);
      return cell < 0 ? 0 : this.terrain.roof[cell];
    };

    specs.push({
      id: "nigeria",
      text: "Nigeria",
      kind: "country",
      x: 0,
      y: 0,
      z: 0,
      rank: 0,
      minDistance: 6500,
      maxDistance: Infinity,
      interactive: false,
    });

    for (const state of grid.meta.states) {
      specs.push({
        id: `state:${state.iso}`,
        text: state.label,
        kind: "state",
        x: state.x,
        y: heightAt(state.x, state.z) + 0.5,
        z: state.z,
        rank: 5,
        minDistance: 160,
        maxDistance: 3600,
        interactive: false,
      });
    }

    for (const [text, lat, lon] of WATERS) {
      const [x, z] = latLonToWorld(lat, lon);
      specs.push({
        id: `water:${text}`,
        text,
        kind: "water",
        x,
        y: 0,
        z,
        rank: 4,
        minDistance: 250,
        maxDistance: 3600,
        interactive: false,
      });
    }

    // How far out (km) a place of each rank still shows.
    const reach: Record<PlaceKind, [number, number, number]> = {
      // The largest cities stay on from far enough out to see the whole
      // country on a phone held upright.
      city: [6000, 2400, 1100],
      university: [5000, 5000, 5000],
      landmark: [5000, 5000, 2600],
    };
    // Universities and landmarks are dots from afar, and get their names
    // once the camera is this close and there is room.
    const named: Partial<Record<PlaceKind, [number, number, number]>> = {
      university: [700, 700, 500],
      landmark: [1100, 900, 500],
    };
    const order: Record<PlaceKind, number> = { city: 0, university: 2.5, landmark: 3 };
    for (const place of this.places) {
      const [x, z] = latLonToWorld(place.lat, place.lon);
      specs.push({
        id: place.id,
        text: place.name,
        kind: place.kind,
        x,
        y: heightAt(x, z) + 0.6,
        z,
        rank: place.rank + order[place.kind],
        minDistance: 0,
        maxDistance: reach[place.kind][place.rank - 1],
        interactive: this.options.interactive,
        dotBeyond: named[place.kind]?.[place.rank - 1],
      });
    }
    return specs;
  }

  // ------------------------------------------------------------- camera --

  private applyPose(camera: THREE.PerspectiveCamera, pose: Pose): void {
    const tilt = clamp(pose.tilt, 0.6, 85) * RAD;
    const az = pose.az * RAD;
    // With az = 0 the camera stands south of its target and looks north.
    camera.position.set(
      pose.x - Math.sin(tilt) * Math.sin(az) * pose.dist,
      this.rest + Math.cos(tilt) * pose.dist,
      pose.z + Math.sin(tilt) * Math.cos(az) * pose.dist,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(pose.x, this.rest, pose.z);

    // Keep the depth range tight: from just in front of the nearest ground
    // to the horizon of the globe.
    const altitude = Math.max(0.05, camera.position.distanceTo(GLOBE_CENTRE) - EARTH_RADIUS_KM);
    const horizon = Math.sqrt(altitude * altitude + 2 * EARTH_RADIUS_KM * altitude);
    camera.near = Math.max(0.002, Math.min(altitude, pose.dist) * 0.04);
    camera.far = Math.max(pose.dist * 3, horizon + (altitude > 1000 ? 1800 : 80));
    camera.aspect = this.width / this.height;
    if (pose.shiftX || pose.shiftY) {
      camera.setViewOffset(
        this.width,
        this.height,
        -pose.shiftX * this.width,
        -pose.shiftY * this.height,
        this.width,
        this.height,
      );
    } else {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  /** The point on a horizontal plane under a screen position, for a pose. */
  private groundAt(clientX: number, clientY: number, pose: Pose, planeY = this.rest): THREE.Vector3 | null {
    const rect = this.options.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.applyPose(this.scratch, pose);
    const point = new THREE.Vector3(nx, ny, 0.5).unproject(this.scratch);
    const direction = point.sub(this.scratch.position).normalize();
    if (direction.y > -1e-4) return null;
    const t = (planeY - this.scratch.position.y) / direction.y;
    return this.scratch.position.clone().addScaledVector(direction, t);
  }

  private pickAt(clientX: number, clientY: number): Picked | null {
    const first = this.groundAt(clientX, clientY, this.pose);
    if (!first) return null;
    let cell = this.grid.cellAt(first.x, first.z);
    if (cell < 0) return null;
    // The ground is not at zero everywhere. Aim again at the height found.
    const second = this.groundAt(
      clientX,
      clientY,
      this.pose,
      this.terrain.ground[cell] * this.shared.uRelief.value,
    );
    if (second) {
      const refined = this.grid.cellAt(second.x, second.z);
      if (refined >= 0) cell = refined;
    }
    const [x, z] = this.grid.cellCentre(cell);
    return {
      cell: this.grid.info(cell),
      nearby: Math.round(this.grid.peopleWithin(x, z, 5) / 100) * 100,
    };
  }

  private limitGoal(): void {
    if (!this.options.interactive) return;
    const g = this.goal;
    g.dist = clamp(g.dist, MIN_DIST, MAX_DIST);
    g.tilt = clamp(g.tilt, 0.6, MAX_TILT);
    g.x = clamp(g.x, this.grid.x0 + 20, this.grid.xMax - 20);
    g.z = clamp(g.z, this.grid.z0 + 20, this.grid.zMax - 20);
  }

  // ----------------------------------------------------------- controls --

  private bindControls(): void {
    const pointers = new Map<number, { x: number; y: number }>();
    let mode: "pan" | "rotate" | "pinch" | null = null;
    let travelled = 0;
    let start = {
      pose: { ...this.goal },
      x: 0,
      y: 0,
      ground: null as THREE.Vector3 | null,
      spread: 1,
      angle: 0,
    };

    const two = () => {
      const [a, b] = [...pointers.values()];
      return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        spread: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        angle: Math.atan2(b.y - a.y, b.x - a.x) / RAD,
      };
    };

    const begin = (event: PointerEvent | null) => {
      const pose = { ...this.goal };
      if (pointers.size >= 2) {
        const t = two();
        mode = "pinch";
        start = {
          pose,
          x: t.x,
          y: t.y,
          ground: this.groundAt(t.x, t.y, pose),
          spread: t.spread,
          angle: t.angle,
        };
      } else if (pointers.size === 1) {
        const [p] = [...pointers.values()];
        const rotate = !!event && (event.button === 2 || event.shiftKey || event.ctrlKey);
        mode = rotate ? "rotate" : "pan";
        start = {
          pose,
          x: p.x,
          y: p.y,
          ground: this.groundAt(p.x, p.y, pose),
          spread: 1,
          angle: 0,
        };
      } else {
        mode = null;
      }
    };

    const down = (event: PointerEvent) => {
      this.options.canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) travelled = 0;
      begin(event);
    };

    const move = (event: PointerEvent) => {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) {
        // Resolved once per frame in step(); a mouse can fire far more often.
        if (event.pointerType === "mouse") this.hoverPending = [event.clientX, event.clientY];
        return;
      }
      travelled += Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      this.stiffness = 16;

      if (mode === "pan" && start.ground) {
        const now = this.groundAt(pointer.x, pointer.y, start.pose);
        if (now) {
          this.goal.x = start.pose.x + start.ground.x - now.x;
          this.goal.z = start.pose.z + start.ground.z - now.z;
        }
      } else if (mode === "rotate") {
        this.goal.az = start.pose.az + (pointer.x - start.x) * 0.3;
        this.goal.tilt = start.pose.tilt - (pointer.y - start.y) * 0.25;
      } else if (mode === "pinch" && pointers.size >= 2) {
        const t = two();
        const turned = { ...start.pose };
        turned.dist = start.pose.dist * (start.spread / t.spread);
        // Twisting two fingers clockwise turns the map with them.
        turned.az = start.pose.az - (t.angle - start.angle);
        this.goal.dist = turned.dist;
        this.goal.az = turned.az;
        if (start.ground) {
          // Keep the spot that was between the fingers between the fingers.
          const now = this.groundAt(t.x, t.y, { ...turned, x: start.pose.x, z: start.pose.z });
          if (now) {
            this.goal.x = start.pose.x + start.ground.x - now.x;
            this.goal.z = start.pose.z + start.ground.z - now.z;
          }
        }
      }
      this.limitGoal();
      this.dirty = true;
    };

    const up = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      const wasTap = pointers.size === 1 && mode === "pan" && travelled < 6;
      pointers.delete(event.pointerId);
      if (wasTap && event.type === "pointerup") {
        this.onPick(this.pickAt(event.clientX, event.clientY));
      }
      begin(null);
    };

    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      // Pinch on a trackpad arrives as a wheel event with ctrl held.
      const delta = event.deltaMode === 1 ? event.deltaY * 30 : event.deltaY;
      const factor = Math.exp(delta * (event.ctrlKey ? 0.01 : 0.0014));
      const before = this.goal.dist;
      const after = clamp(before * factor, MIN_DIST, MAX_DIST);
      const under = this.groundAt(event.clientX, event.clientY, this.goal);
      if (under) {
        // Zoom towards whatever is under the cursor.
        const k = after / before;
        this.goal.x = under.x + (this.goal.x - under.x) * k;
        this.goal.z = under.z + (this.goal.z - under.z) * k;
      }
      this.goal.dist = after;
      this.stiffness = 12;
      this.limitGoal();
      this.dirty = true;
    };

    const key = (event: KeyboardEvent) => {
      const g = this.goal;
      const stride = g.dist * 0.12;
      const az = g.az * RAD;
      const forward = [Math.sin(az), -Math.cos(az)];
      const right = [Math.cos(az), Math.sin(az)];
      const actions: Record<string, () => void> = {
        ArrowUp: () => ((g.x += forward[0] * stride), (g.z += forward[1] * stride)),
        ArrowDown: () => ((g.x -= forward[0] * stride), (g.z -= forward[1] * stride)),
        ArrowRight: () => ((g.x += right[0] * stride), (g.z += right[1] * stride)),
        ArrowLeft: () => ((g.x -= right[0] * stride), (g.z -= right[1] * stride)),
        "+": () => (g.dist *= 0.8),
        "=": () => (g.dist *= 0.8),
        "-": () => (g.dist *= 1.25),
        q: () => (g.az -= 15),
        e: () => (g.az += 15),
        PageUp: () => (g.tilt -= 8),
        PageDown: () => (g.tilt += 8),
      };
      const action = actions[event.key];
      if (!action || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      action();
      this.stiffness = 8;
      this.limitGoal();
      this.dirty = true;
    };

    const leave = () => this.onHover(null);
    const menu = (event: Event) => event.preventDefault();

    this.listen("pointerdown", down);
    this.listen("pointermove", move);
    this.listen("pointerup", up);
    this.listen("pointercancel", up);
    this.listen("pointerleave", leave);
    this.listen("wheel", wheel, { passive: false });
    this.listen("keydown", key);
    this.listen("contextmenu", menu);
  }

  /** Listen on the canvas until the map is disposed of. */
  private listen<K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  private listen(type: `webglcontext${string}`, handler: (event: Event) => void): void;
  private listen(type: string, handler: (event: never) => void, options?: AddEventListenerOptions): void {
    const canvas = this.options.canvas;
    canvas.addEventListener(type, handler as EventListener, options);
    this.disposers.push(() => canvas.removeEventListener(type, handler as EventListener));
  }

  /** Buttons next to the map use these, so everything works without a mouse. */
  zoomBy(factor: number): void {
    this.setGoal({ dist: this.goal.dist * factor }, 8);
    this.limitGoal();
  }
  rotateBy(degrees: number): void {
    this.setGoal({ az: this.goal.az + degrees }, 6);
  }
  tiltTo(degrees: number): void {
    this.setGoal({ tilt: degrees }, 6);
    this.limitGoal();
  }

  // --------------------------------------------------------------- loop --

  private observeSize(): void {
    const canvas = this.options.canvas;
    const resize = () => {
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      if (width === this.width && height === this.height) return;
      this.width = width;
      this.height = height;
      this.renderer.setSize(width, height, false);
      this.dirty = true;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    // Nothing is drawn while the map is scrolled away or covered.
    const visibility = new IntersectionObserver(([entry]) => {
      this.onScreen = entry.isIntersecting;
      this.dirty = true;
    });
    visibility.observe(canvas);
    this.disposers.push(() => {
      observer.disconnect();
      visibility.disconnect();
    });
  }

  private bindContext(): void {
    this.listen("webglcontextlost", (event) => event.preventDefault());
    this.listen("webglcontextrestored", () => {
      // Street tiles give up their data once it is on the graphics card,
      // so they are loaded again.
      this.streets?.reset();
      this.dirty = true;
    });
  }

  private step(now: number): void {
    const dt = clamp((now - this.lastTime) / 1000, 0, 0.1);
    this.lastTime = now;
    if (!this.onScreen || document.hidden) return;

    // Ease the camera towards its goal. Distance moves on a log scale so a
    // zoom from orbit to street level feels even all the way down.
    const p = this.pose;
    const g = this.goal;
    const a = 1 - Math.exp(-this.stiffness * dt);
    const turn = ((((g.az - p.az) % 360) + 540) % 360) - 180;
    const zoom = Math.log(g.dist / p.dist);
    const gap =
      Math.abs(g.x - p.x) / p.dist +
      Math.abs(g.z - p.z) / p.dist +
      Math.abs(zoom) +
      Math.abs(turn) / 90 +
      Math.abs(g.tilt - p.tilt) / 90 +
      Math.abs(g.shiftX - p.shiftX) +
      Math.abs(g.shiftY - p.shiftY);
    const moving = gap > 2e-4;
    if (moving) {
      p.x += (g.x - p.x) * a;
      p.z += (g.z - p.z) * a;
      p.dist *= Math.exp(zoom * a);
      p.az += turn * a;
      p.tilt += (g.tilt - p.tilt) * a;
      p.shiftX += (g.shiftX - p.shiftX) * a;
      p.shiftY += (g.shiftY - p.shiftY) * a;
    } else if (gap > 0) {
      Object.assign(p, g);
      this.dirty = true;
    }

    const overcast = this.shared.uOvercast;
    const weather = Math.abs(this.overcastGoal - overcast.value) > 0.002;
    if (weather) {
      overcast.value += (this.overcastGoal - overcast.value) * (1 - Math.exp(-3 * dt));
    }

    if (this.hoverPending) {
      const [x, y] = this.hoverPending;
      this.hoverPending = null;
      this.onHover(this.pickAt(x, y));
    }

    // The stretched relief relaxes as the camera comes down. On a log
    // scale, so it keeps pace with the zoom.
    const t = clamp(Math.log(p.dist / RELIEF_GONE) / Math.log(RELIEF_FULL / RELIEF_GONE), 0, 1);
    const relief = t * t * (3 - 2 * t);
    const rest = this.terrain.surfaceAt(p.x, p.z) * relief;
    const settling = Math.abs(rest - this.rest) > 1e-4 * p.dist;
    this.rest += (rest - this.rest) * (1 - Math.exp(-6 * dt));

    if (!moving && !weather && !settling && !this.dirty) {
      // Nothing changed but the people on the streets and the trains, if
      // there are any. Every other frame is plenty for them.
      if (!(this.streets.strolling || this.railMoving) || (this.held = !this.held)) return;
    }
    this.dirty = false;
    const since = clamp((now - this.lastDrawn) / 1000, 0, 0.1);
    this.lastDrawn = now;

    this.applyPose(this.camera, p);
    this.shared.uRelief.value = relief;
    // Streets float a hair above the flat ground: more from further away,
    // where the depth buffer is coarser.
    this.shared.uLift.value = 0.0004 * clamp(p.dist, 0.5, 5);
    // Haze towards the horizon when close in; none from orbit. At street
    // level it closes in, because only the area around the camera is loaded.
    const hazy = p.dist < 4000;
    this.shared.uFogNear.value = hazy ? p.dist * (1.9 + 0.7 * relief) : 1e7;
    this.shared.uFogFar.value = hazy ? p.dist * (6 + 3 * relief) : 2e7;
    this.globe.update(p.dist);
    this.terrain.update(relief);
    if (this.streets.update(p, g, since)) this.dirty = true;
    const daylight = smoothstep(-0.1, 0.14, this.shared.uSunDir.value.y);
    this.railMoving = this.rail.update(p.x, p.z, p.dist, since, daylight, this.peopleShown);
    if (this.aerial.update(p)) this.dirty = true;
    this.labels.update(this.camera, this.width, this.height, p.dist, relief);
    this.renderer.render(this.scene, this.camera);
    if (moving) this.onMove({ ...p });
  }
}
