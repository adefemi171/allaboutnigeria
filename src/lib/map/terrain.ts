// Turns the grid into the voxel model: terraced ground, water, and a block
// of buildings on every square where people live.

import * as THREE from "three";
import { Grid, KIND_FOREIGN, KIND_NG, KIND_SEA, KIND_WATER } from "./grid";
import { clamp, smoothstep } from "./math";
import {
  BUILDINGS,
  DITHER_GLSL,
  FLOOD,
  FOG_GLSL,
  INLAND_WATER,
  LEVEL,
  LIGHTING_GLSL,
  SEA_SIDE,
  SOIL,
  abroadColour,
  hash,
  heightOf,
  hex,
  landColour,
  levelOf,
  metresOf,
  mix,
  seaColour,
  type RGB,
} from "./style";

export interface SharedUniforms {
  uSunDir: { value: THREE.Vector3 };
  uOvercast: { value: number };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  /**
   * How much of the stretched relief is left: 1 from afar, 0 at street
   * level, where the ground is drawn flat.
   */
  uRelief: { value: number };
  /** How far street-level detail floats above the flat ground, km. */
  uLift: { value: number };
  [name: string]: THREE.IUniform;
}

export interface Terrain {
  group: THREE.Group;
  /** Height of the ground at each cell, in scene km. */
  ground: Float32Array;
  /** Height of the tallest thing at each cell (ground or roof), scene km. */
  roof: Float32Array;
  /**
   * Height of the ground (scene km, full relief) smoothed over a few cells,
   * for the camera to rest on as it travels over the hills.
   */
  surfaceAt(wx: number, wz: number): number;
  /** Ground height under a point (scene km, full relief); 0 outside the grid. */
  groundAt(wx: number, wz: number): number;
  /** Show the land below a sea level (metres), or null to hide. */
  setFlood(level: number | null): void;
  /**
   * When photo is true, hide the atlas-coloured ground so the satellite
   * picture can take its place. The blocks of buildings stay.
   */
  setPhoto(photo: boolean): void;
  /** Called every frame with the relief that is left (see uRelief). */
  update(relief: number): void;
  dispose(): void;
}

// Faces of a box, in the order the vertex shader expects.
const FACE_TOP = 0;
const FACE_EAST = 1;
const FACE_WEST = 2;
const FACE_SOUTH = 3;
const FACE_NORTH = 4;

// The surroundings fade out between these distances from Nigeria, and in a
// band along the edge of the grid. All in cells (2 km each).
const FADE_START = 8;
const FADE_END = 30;
const EDGE_FADE = 10;
/** Cells the camera's resting height is averaged over, each way. */
const SMOOTH = 4;

const GROUND_VERTEX = /* glsl */ `
attribute vec4 aBase;   // column, level, row, face
attribute vec2 aSize;   // run length in cells, rise in levels
attribute vec4 aColor;  // rgb, and whether to draw the cell grid
attribute float aFade;  // how solidly the cell is drawn
uniform vec3 uGridOrigin;
uniform float uCell;
uniform float uLevel;
uniform float uRelief;
varying vec3 vAlbedo;
varying float vGridded;
varying float vFade;
varying vec3 vNormal;
varying vec3 vWorld;
${LIGHTING_GLSL}
void main() {
  float face = aBase.w;
  vec3 base = vec3(
    uGridOrigin.x + aBase.x * uCell,
    aBase.y * uLevel * uRelief,
    uGridOrigin.z + aBase.z * uCell
  );
  float along = position.x * aSize.x * uCell;
  float rise = position.y * aSize.y * uLevel * uRelief;
  vec3 p;
  vec3 n;
  if (face < 0.5) {
    p = base + vec3(along, 0.0, position.y * uCell);
    n = vec3(0.0, 1.0, 0.0);
  } else if (face < 1.5) {
    p = base + vec3(uCell, rise, along);
    n = vec3(1.0, 0.0, 0.0);
  } else if (face < 2.5) {
    p = base + vec3(0.0, rise, along);
    n = vec3(-1.0, 0.0, 0.0);
  } else if (face < 3.5) {
    p = base + vec3(along, rise, uCell);
    n = vec3(0.0, 0.0, 1.0);
  } else {
    p = base + vec3(along, rise, 0.0);
    n = vec3(0.0, 0.0, -1.0);
  }
  vAlbedo = toLinear(aColor.rgb);
  vGridded = aColor.a;
  vFade = aFade;
  vNormal = n;
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const GROUND_FRAGMENT = /* glsl */ `
uniform vec3 uGridOrigin;
uniform float uCell;
varying vec3 vAlbedo;
varying float vGridded;
varying float vFade;
varying vec3 vNormal;
varying vec3 vWorld;
${LIGHTING_GLSL}
${FOG_GLSL}
${DITHER_GLSL}
float cellNoise(vec2 cell) {
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  // The neighbours and the sea dissolve into the globe beneath them.
  if (vFade < 0.999 && dithered(vFade)) discard;
  vec3 albedo = vAlbedo;
  bool top = vNormal.y > 0.5;
  if (top && vGridded > 0.5) {
    // Draw each 2 km square: a faint edge and a slightly different shade.
    // Both fade out once a square is only a few pixels wide.
    vec2 g = (vWorld.xz - uGridOrigin.xz) / uCell;
    vec2 w = fwidth(g);
    float perPixel = max(w.x, w.y);
    float show = clamp(1.0 - perPixel * 3.0, 0.0, 1.0);
    vec2 f = abs(fract(g) - 0.5);
    float line = smoothstep(0.46 - perPixel, 0.5 - perPixel * 0.5, max(f.x, f.y));
    albedo *= 1.0 + (cellNoise(floor(g)) - 0.5) * 0.10 * show;
    albedo *= 1.0 - 0.17 * line * show;
  }
  vec3 colour = shade(albedo, vNormal, vec3(0.0, 1.0, 0.0), 1.0);
  if (!top) colour *= 0.86;
  gl_FragColor = vec4(toDisplay(applyFog(colour, vWorld)), 1.0);
}
`;

const BUILDING_VERTEX = /* glsl */ `
attribute vec3 aOffset;
attribute vec3 aScale;
attribute vec4 aColor;  // rgb, and how brightly the windows are lit
uniform float uRelief;
varying vec3 vAlbedo;
varying float vLit;
varying vec3 vNormal;
varying vec3 vWorld;
${LIGHTING_GLSL}
void main() {
  vec3 p = position * aScale;
  // The blocks shrink with the relief, and sink into the ground just
  // before real buildings take their place.
  p.y = p.y * uRelief - 0.06 * (1.0 - smoothstep(0.0, 0.22, uRelief));
  p += vec3(aOffset.x, aOffset.y * uRelief, aOffset.z);
  vAlbedo = toLinear(aColor.rgb);
  vLit = aColor.a;
  vNormal = normal;
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const BUILDING_FRAGMENT = /* glsl */ `
varying vec3 vAlbedo;
varying float vLit;
varying vec3 vNormal;
varying vec3 vWorld;
${LIGHTING_GLSL}
${FOG_GLSL}
void main() {
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 colour = shade(vAlbedo, vNormal, up, 1.0);
  bool top = vNormal.y > 0.5;
  if (!top) colour *= 0.9;
  // Lights come on as the sun goes down.
  float night = 1.0 - dayAmount(up);
  colour += vec3(1.0, 0.66, 0.32) * night * vLit * (top ? 0.12 : 0.5);
  gl_FragColor = vec4(toDisplay(applyFog(colour, vWorld)), 1.0);
}
`;

const FLOOD_VERTEX = /* glsl */ `
uniform float uFloodHeight;
uniform float uRelief;
uniform float uLift;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  // Just above the level, and above the streets when those are showing.
  world.y = uFloodHeight * uRelief + uLift * (1.0 - uRelief) + 0.0012;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FLOOD_FRAGMENT = /* glsl */ `
uniform vec3 uFloodColor;
uniform vec4 uBounds;        // xMin, zMin, xMax, zMax
uniform sampler2D uPresence; // how solidly the model is drawn, per cell
uniform sampler2D uGround;   // height of the ground, per cell
uniform float uFloodHeight;
uniform float uOpacity;
varying vec3 vWorld;
${LIGHTING_GLSL}
${FOG_GLSL}
void main() {
  vec3 colour = shade(toLinear(uFloodColor), vec3(0.0, 1.0, 0.0), vec3(0.0, 1.0, 0.0), 1.0);
  // The water fades out where the model does.
  vec2 cell = (vWorld.xz - uBounds.xy) / (uBounds.zw - uBounds.xy);
  // Only squares that lie below the level are under water. Asking the
  // grid, instead of letting the sheet cut through the model, also works
  // at street level, where the ground is drawn flat.
  if (texture2D(uGround, cell).r > uFloodHeight - 0.001) discard;
  float alpha = uOpacity * texture2D(uPresence, cell).r;
  gl_FragColor = vec4(toDisplay(applyFog(colour, vWorld)), alpha);
}
`;

function pack(colour: RGB, flag: number): number {
  return (
    (Math.round(colour[0]) | (Math.round(colour[1]) << 8) | (Math.round(colour[2]) << 16) | (flag << 24)) >>>
    0
  );
}

export function buildTerrain(grid: Grid, shared: SharedUniforms, lite: boolean): Terrain {
  const W = grid.width;
  const H = grid.height;
  const N = W * H;

  /** Steps from the nearest cell that matches, counted up to a limit. */
  const stepsFrom = (matches: (c: number) => boolean, limit: number) => {
    const steps = new Uint8Array(N).fill(255);
    let frontier: number[] = [];
    for (let c = 0; c < N; c++) {
      if (matches(c)) {
        steps[c] = 0;
        frontier.push(c);
      }
    }
    for (let d = 1; d <= limit && frontier.length; d++) {
      const next: number[] = [];
      for (const c of frontier) {
        const i = c % W;
        const neighbours = [
          i + 1 < W ? c + 1 : -1,
          i > 0 ? c - 1 : -1,
          c + W < N ? c + W : -1,
          c - W >= 0 ? c - W : -1,
        ];
        for (const n of neighbours) {
          if (n >= 0 && steps[n] === 255) {
            steps[n] = d;
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    return steps;
  };

  // How far each cell is from any land (for the shallow-water tint) and
  // from Nigeria (for fading the surroundings out).
  const coast = stepsFrom((c) => grid.kind(c) !== KIND_SEA, 7);
  const abroad = stepsFrom((c) => grid.isNigeria(c), FADE_END);

  // The model is Nigeria plus a halo of sea and neighbours that dissolves
  // into the globe. 1 is fully drawn, 0 is left to the globe. Quantised so
  // neighbouring cells share a value and merge into strips.
  const presence = new Float32Array(N);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = j * W + i;
      const border = Math.min(i, W - 1 - i, j, H - 1 - j);
      const fade = (1 - smoothstep(FADE_START, FADE_END, abroad[c])) * smoothstep(0, EDGE_FADE, border);
      presence[c] = Math.round(fade * 12) / 12;
    }
  }

  // ---- terrace level and colours of every cell
  const level = new Int16Array(N);
  const topColour = new Uint32Array(N);
  const sideColour = new Uint32Array(N);
  const landByLevel = new Map<number, [number, number]>();
  const abroadByLevel = new Map<number, RGB>();

  for (let c = 0; c < N; c++) {
    const kind = grid.kind(c);
    const metres = grid.metres[c];
    if (kind === KIND_NG) {
      const l = levelOf(metres);
      level[c] = l;
      let colours = landByLevel.get(l);
      if (!colours) {
        const top = landColour(metresOf(l * LEVEL));
        colours = [pack(top, 255), pack(mix(top, SOIL, 0.5), 0)];
        landByLevel.set(l, colours);
      }
      topColour[c] = colours[0];
      sideColour[c] = colours[1];
    } else if (kind === KIND_WATER) {
      level[c] = levelOf(metres) - 2;
      topColour[c] = pack(INLAND_WATER, 0);
      sideColour[c] = pack(mix(INLAND_WATER, SEA_SIDE, 0.5), 0);
    } else if (kind === KIND_FOREIGN) {
      // Neighbours keep their relief but lose their colour.
      const l = levelOf(metres);
      level[c] = l;
      let colour = abroadByLevel.get(l);
      if (!colour) {
        colour = abroadColour(metresOf(l * LEVEL));
        abroadByLevel.set(l, colour);
      }
      topColour[c] = pack(colour, 0);
      sideColour[c] = pack(mix(colour, [0, 0, 0], 0.3), 0);
    } else {
      level[c] = 0;
      topColour[c] = pack(seaColour(coast[c]), 0);
      sideColour[c] = pack(SEA_SIDE, 0);
    }
  }

  // ---- faces. One instance per face: tops merged into strips along a row
  // where neighbours match, sides only where a cell stands above its
  // neighbour, merged the same way along the row or the column they face.
  let capacity = N;
  let base = new Int16Array(capacity * 4);
  let size = new Uint16Array(capacity * 2);
  let colour = new Uint32Array(capacity);
  let fade = new Uint8Array(capacity);
  let count = 0;
  const push = (
    i: number,
    l: number,
    j: number,
    face: number,
    length: number,
    rise: number,
    packed: number,
    solid: number,
  ) => {
    if (count === capacity) {
      capacity *= 2;
      const b = new Int16Array(capacity * 4);
      b.set(base);
      base = b;
      const s = new Uint16Array(capacity * 2);
      s.set(size);
      size = s;
      const k = new Uint32Array(capacity);
      k.set(colour);
      colour = k;
      const f = new Uint8Array(capacity);
      f.set(fade);
      fade = f;
    }
    base[count * 4] = i;
    base[count * 4 + 1] = l;
    base[count * 4 + 2] = j;
    base[count * 4 + 3] = face;
    size[count * 2] = length;
    size[count * 2 + 1] = rise;
    colour[count] = packed;
    fade[count] = Math.round(solid * 255);
    count++;
  };

  for (let j = 0; j < H; j++) {
    let i = 0;
    while (i < W) {
      const c = j * W + i;
      let end = i + 1;
      while (
        end < W &&
        level[j * W + end] === level[c] &&
        topColour[j * W + end] === topColour[c] &&
        presence[j * W + end] === presence[c]
      ) {
        end++;
      }
      if (presence[c] > 0) push(i, level[c], j, FACE_TOP, end - i, 0, topColour[c], presence[c]);
      i = end;
    }
  }

  /**
   * The walls facing one way, in runs: `line` cells of `count` each, the
   * cell at a step along a line, and its neighbour on the side the wall faces.
   */
  const walls = (
    face: number,
    lines: number,
    count: number,
    cellAt: (line: number, step: number) => number,
    next: (c: number) => number,
    origin: (line: number, step: number) => [i: number, j: number],
  ) => {
    for (let line = 0; line < lines; line++) {
      let step = 0;
      while (step < count) {
        const c = cellAt(line, step);
        const n = next(c);
        if (n < 0 || presence[c] === 0 || level[n] >= level[c]) {
          step++;
          continue;
        }
        let end = step + 1;
        while (end < count) {
          const d = cellAt(line, end);
          const m = next(d);
          if (
            m < 0 ||
            level[d] !== level[c] ||
            level[m] !== level[n] ||
            sideColour[d] !== sideColour[c] ||
            presence[d] !== presence[c]
          ) {
            break;
          }
          end++;
        }
        const [i, j] = origin(line, step);
        push(i, level[n], j, face, end - step, level[c] - level[n], sideColour[c], presence[c]);
        step = end;
      }
    }
  };
  const byRow = (j: number, i: number) => j * W + i;
  const byColumn = (i: number, j: number) => j * W + i;
  walls(
    FACE_SOUTH,
    H,
    W,
    byRow,
    (c) => (c + W < N ? c + W : -1),
    (j, i) => [i, j],
  );
  walls(
    FACE_NORTH,
    H,
    W,
    byRow,
    (c) => (c - W >= 0 ? c - W : -1),
    (j, i) => [i, j],
  );
  walls(
    FACE_EAST,
    W,
    H,
    byColumn,
    (c) => (c % W < W - 1 ? c + 1 : -1),
    (i, j) => [i, j],
  );
  walls(
    FACE_WEST,
    W,
    H,
    byColumn,
    (c) => (c % W > 0 ? c - 1 : -1),
    (i, j) => [i, j],
  );

  const groundGeometry = new THREE.InstancedBufferGeometry();
  groundGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3),
  );
  groundGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  groundGeometry.setAttribute("aBase", new THREE.InstancedBufferAttribute(base.slice(0, count * 4), 4));
  groundGeometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(size.slice(0, count * 2), 2));
  groundGeometry.setAttribute(
    "aColor",
    new THREE.InstancedBufferAttribute(new Uint8Array(colour.buffer.slice(0, count * 4)), 4, true),
  );
  groundGeometry.setAttribute("aFade", new THREE.InstancedBufferAttribute(fade.slice(0, count), 1, true));
  groundGeometry.instanceCount = count;

  const gridUniforms = {
    uGridOrigin: { value: new THREE.Vector3(grid.x0, 0, grid.z0) },
    uCell: { value: grid.cell },
    uLevel: { value: LEVEL },
  };
  const groundMaterial = new THREE.ShaderMaterial({
    uniforms: { ...shared, ...gridUniforms },
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT,
    side: THREE.DoubleSide,
  });
  const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.frustumCulled = false;

  // ---- buildings
  const ground = new Float32Array(N);
  const roof = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    ground[c] = level[c] * LEVEL;
    roof[c] = ground[c];
  }

  const palettes = {
    village: BUILDINGS.village.map(hex),
    town: BUILDINGS.town.map(hex),
    city: BUILDINGS.city.map(hex),
  };
  const offsets: number[] = [];
  const scales: number[] = [];
  const tints: number[] = [];
  const quarter = grid.cell / 4;
  // A phone skips the emptiest squares, where a computer gives every
  // inhabited square its block.
  const fewest = lite ? 200 : 1;

  for (let c = 0; c < N; c++) {
    const people = grid.people(c);
    if (people < fewest || !grid.isDryLand(c)) continue;
    const [cx, cz] = grid.cellCentre(c);
    // Square-root scale: a hamlet is a low block, a square of central Lagos
    // or Kano a tower. Kept squat so a city reads as a mass and not as a
    // bed of nails.
    const height = 0.08 + 0.005 * Math.sqrt(people);
    const many = people < 2000 ? 1 : people < 15000 ? 2 : people < 40000 ? 3 : 4;
    const blocks = lite ? Math.min(2, many) : many;
    const footprint = grid.cell * (people < 300 ? 0.28 : people < 4000 ? 0.34 : 0.4);
    const palette = people < 2000 ? palettes.village : people < 15000 ? palettes.town : palettes.city;
    const first = Math.floor(hash(c) * 4);
    for (let k = 0; k < blocks; k++) {
      const seed = c * 4 + k;
      const corner = (first + k) % 4;
      const jitter = quarter * 0.18;
      const x = cx + (corner & 1 ? quarter : -quarter) + (hash(seed + 7) - 0.5) * jitter;
      const z = cz + (corner & 2 ? quarter : -quarter) + (hash(seed + 13) - 0.5) * jitter;
      let h = height * (0.7 + 0.6 * hash(seed + 29));
      // Dense squares get one block that stands well above the rest.
      if (people > 20000 && k === 0) h *= 1.4;
      const tint = palette[Math.floor(hash(seed + 41) * palette.length)];
      offsets.push(x, ground[c], z);
      scales.push(
        footprint * (0.82 + 0.26 * hash(seed + 53)),
        h,
        footprint * (0.82 + 0.26 * hash(seed + 67)),
      );
      // About a third of the blocks stay dark at night: the grid does not
      // reach everyone.
      const lit = hash(seed + 79) < 0.36 ? 0 : 0.3 + 0.6 * hash(seed + 83);
      tints.push(tint[0], tint[1], tint[2], Math.round(lit * 255));
      if (ground[c] + h > roof[c]) roof[c] = ground[c] + h;
    }
  }

  // A unit box standing on y = 0. Nobody sees the bottom, which leaves out
  // a sixth of the work for a quarter of a million blocks.
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const bottom = box.groups[3];
  const index = box.getIndex()!.array;
  const sides = [...index.slice(0, bottom.start), ...index.slice(bottom.start + bottom.count)];
  const buildingGeometry = new THREE.InstancedBufferGeometry();
  buildingGeometry.setAttribute("position", box.getAttribute("position"));
  buildingGeometry.setAttribute("normal", box.getAttribute("normal"));
  buildingGeometry.setIndex(sides);
  buildingGeometry.setAttribute("aOffset", new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
  buildingGeometry.setAttribute("aScale", new THREE.InstancedBufferAttribute(new Float32Array(scales), 3));
  buildingGeometry.setAttribute("aColor", new THREE.InstancedBufferAttribute(new Uint8Array(tints), 4, true));
  buildingGeometry.instanceCount = offsets.length / 3;
  const buildingMaterial = new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: BUILDING_VERTEX,
    fragmentShader: BUILDING_FRAGMENT,
  });
  const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
  buildingMesh.frustumCulled = false;

  // ---- the sheet of water for "what lies below this sea level"
  const presenceTexture = new THREE.DataTexture(
    Uint8Array.from(presence, (value) => Math.round(value * 255)),
    W,
    H,
    THREE.RedFormat,
  );
  presenceTexture.magFilter = THREE.LinearFilter;
  presenceTexture.minFilter = THREE.LinearFilter;
  presenceTexture.needsUpdate = true;
  const groundTexture = new THREE.DataTexture(ground, W, H, THREE.RedFormat, THREE.FloatType);
  groundTexture.magFilter = THREE.NearestFilter;
  groundTexture.minFilter = THREE.NearestFilter;
  groundTexture.needsUpdate = true;
  const floodUniforms = {
    uFloodColor: { value: new THREE.Vector3(FLOOD[0] / 255, FLOOD[1] / 255, FLOOD[2] / 255) },
    uBounds: { value: new THREE.Vector4(grid.x0, grid.z0, grid.xMax, grid.zMax) },
    uPresence: { value: presenceTexture },
    uGround: { value: groundTexture },
    uFloodHeight: { value: 0 },
    uOpacity: { value: 0.82 },
  };
  const floodMaterial = new THREE.ShaderMaterial({
    uniforms: { ...shared, ...floodUniforms },
    vertexShader: FLOOD_VERTEX,
    fragmentShader: FLOOD_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const floodGeometry = new THREE.PlaneGeometry(grid.xMax - grid.x0, grid.zMax - grid.z0).rotateX(
    -Math.PI / 2,
  );
  const floodMesh = new THREE.Mesh(floodGeometry, floodMaterial);
  floodMesh.position.set((grid.x0 + grid.xMax) / 2, 0, (grid.z0 + grid.zMax) / 2);
  floodMesh.visible = false;
  floodMesh.frustumCulled = false;
  // After the streets, which are drawn in the same pass.
  floodMesh.renderOrder = 10;

  // ---- where the camera rests: the ground averaged over a few cells, so
  // it glides over a plateau's edge instead of jumping a terrace at a time
  const smooth = new Float32Array(N);
  {
    const row = new Float32Array(N);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        let sum = 0;
        for (let d = -SMOOTH; d <= SMOOTH; d++) sum += ground[j * W + clamp(i + d, 0, W - 1)];
        row[j * W + i] = sum / (2 * SMOOTH + 1);
      }
    }
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        let sum = 0;
        for (let d = -SMOOTH; d <= SMOOTH; d++) sum += row[clamp(j + d, 0, H - 1) * W + i];
        smooth[j * W + i] = Math.max(0, sum / (2 * SMOOTH + 1));
      }
    }
  }

  const group = new THREE.Group();
  group.add(groundMesh, buildingMesh, floodMesh);
  let photo = false;

  return {
    group,
    ground,
    roof,
    surfaceAt(wx, wz) {
      // Bilinear between cell centres.
      const fx = clamp((wx - grid.x0) / grid.cell - 0.5, 0, W - 1);
      const fz = clamp((wz - grid.z0) / grid.cell - 0.5, 0, H - 1);
      const i = Math.min(Math.floor(fx), W - 2);
      const j = Math.min(Math.floor(fz), H - 2);
      const tx = fx - i;
      const tz = fz - j;
      const c = j * W + i;
      return (
        (smooth[c] * (1 - tx) + smooth[c + 1] * tx) * (1 - tz) +
        (smooth[c + W] * (1 - tx) + smooth[c + W + 1] * tx) * tz
      );
    },
    groundAt(wx, wz) {
      const cell = grid.cellAt(wx, wz);
      return cell < 0 ? 0 : ground[cell];
    },
    setFlood(metres) {
      floodMesh.visible = metres !== null;
      if (metres !== null) floodUniforms.uFloodHeight.value = heightOf(metres);
    },
    setPhoto(next) {
      photo = next;
      groundMesh.visible = !photo;
    },
    update(relief) {
      buildingMesh.visible = relief > 0.001;
      groundMesh.visible = !photo;
    },
    dispose() {
      groundGeometry.dispose();
      groundMaterial.dispose();
      buildingGeometry.dispose();
      buildingMaterial.dispose();
      box.dispose();
      floodGeometry.dispose();
      floodMaterial.dispose();
      presenceTexture.dispose();
      groundTexture.dispose();
    },
  };
}
