// How data turns into shapes and colours.

export type RGB = readonly [number, number, number];

/** Height of one terrace in the model, in scene kilometres. */
export const LEVEL = 0.2;

const HEIGHT_SCALE = 0.02;
const HEIGHT_POWER = 0.85;

/**
 * Model height (km) for a real height (metres above sea level).
 *
 * The country is 1,300 km wide and its relief is measured in hundreds of
 * metres, so true scale would be flat as paper. This stretches heights by a
 * power curve: Lagos at a few metres stays low, Kano and Abuja at about
 * 480 m stand near 4 km, the Jos Plateau about 9 km, and the Mambilla
 * highlands do not turn into spikes.
 */
export function heightOf(metres: number): number {
  return Math.sign(metres) * HEIGHT_SCALE * Math.abs(metres) ** HEIGHT_POWER;
}

/** Inverse of heightOf. */
export function metresOf(height: number): number {
  return Math.sign(height) * (Math.abs(height) / HEIGHT_SCALE) ** (1 / HEIGHT_POWER);
}

/** Terrace number for a real height. Level 0 is sea level. */
export function levelOf(metres: number): number {
  return Math.round(heightOf(metres) / LEVEL);
}

export function hex(value: string): RGB {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function ramp(stops: readonly (readonly [number, RGB])[], value: number): RGB {
  if (value <= stops[0][0]) return stops[0][1];
  for (let k = 1; k < stops.length; k++) {
    const [at, colour] = stops[k];
    if (value <= at) {
      const [prevAt, prev] = stops[k - 1];
      return mix(prev, colour, (value - prevAt) / (at - prevAt));
    }
  }
  return stops[stops.length - 1][1];
}

// Land is tinted by height the way a school atlas does it: the deep green of
// the coast and the delta, the yellow of the savanna plateaux, and brown for
// the Jos Plateau and the eastern highlands. The same stops draw the legend
// (LAND_LEGEND below).
const LAND: readonly (readonly [number, RGB])[] = [
  [0, hex("#4f9a6c")],
  [30, hex("#68a865")],
  [120, hex("#8db862")],
  [300, hex("#b4c26a")],
  [500, hex("#d0c475")],
  [800, hex("#d6ae6c")],
  [1200, hex("#bf9260")],
  [1700, hex("#a07652")],
  [2300, hex("#87634b")],
];

/** CSS for the ground-height legend, from the same stops as the model. */
export const LAND_LEGEND = `linear-gradient(to right, ${LAND.map(
  ([metres, [r, g, b]]) => `rgb(${r} ${g} ${b}) ${((metres / 2300) * 100).toFixed(1)}%`,
).join(", ")})`;

const ABROAD: readonly (readonly [number, RGB])[] = [
  [0, hex("#1f2932")],
  [300, hex("#28333d")],
  [1500, hex("#35414b")],
];

const SEA_DEEP = hex("#12324b");
const SEA_SHALLOW = hex("#1f5677");
export const SEA_SIDE = hex("#0d2639");
export const INLAND_WATER = hex("#3b8ec2");
export const SOIL = hex("#7a5638");
export const FLOOD = hex("#3f93cf");
export const BACKGROUND = hex("#0b1620");

/** The globe's colour while its pictures are on their way. */
export const GLOBE_SEA = hex("#0d1c29");

export function landColour(metres: number): RGB {
  return ramp(LAND, metres);
}

export function abroadColour(metres: number): RGB {
  return ramp(ABROAD, metres);
}

/** Sea colour by distance from the nearest land, in cells. */
export function seaColour(cellsFromLand: number): RGB {
  const t = Math.min(1, Math.max(0, (cellsFromLand - 1) / 6));
  return mix(SEA_SHALLOW, SEA_DEEP, t);
}

// Buildings. Villages are mud brick and laterite under zinc; towns add
// painted concrete; the big cities pale towers and glass.
export const BUILDINGS = {
  village: ["#a0603d", "#b5774a", "#8f5a3c", "#c39c6e", "#9a9d9f", "#b08d57"],
  town: ["#d8cbb5", "#a0603d", "#c2b8a3", "#8f9496", "#b5774a", "#e3d9c6"],
  city: ["#e6e1d6", "#c9cfd4", "#9aa3ab", "#d9cbb0", "#6f7780", "#b8b2a6"],
} as const;

// Street level. The ground is drawn like a town plan: pale built-up land,
// dark tarred roads and the red laterite of the unpaved ones.
export const STREET = {
  built: "#c4b69c",
  commercial: "#c6bcab",
  other: "#c3bb9f",
  grass: "#a3b866",
  field: "#c9b77c",
  wood: "#5c8f4e",
  scrub: "#9aa865",
  wetland: "#7d9e86",
  sand: "#e2d1a0",
  rock: "#a39c90",
  cemetery: "#9db58a",
  campus: "#d3c7ae",
  pitch: "#7fae5f",
  railbed: "#918c82",
  jetty: "#8a7a66",
  apron: "#8d9094",
  water: "#3f8fc4",
  sea: "#2f6f9f",
  motorway: "#4e545c",
  trunk: "#565d66",
  primary: "#5d636b",
  secondary: "#666b72",
  tertiary: "#70757b",
  minor: "#8a8783",
  service: "#9d9b95",
  laterite: "#b5704a",
  path: "#d2c3a5",
  runway: "#777c82",
  rail: "#454950",
  transit: "#63676d",
  trunkWood: "#6b4f3a",
  leaves: ["#4f8f4a", "#5a9a52", "#467f45", "#6aa558", "#3f7a3f"],
} as const;

/**
 * Wall and roof colours by number of floors. Overture's footprints carry a
 * height for very few Nigerian buildings, so most heights are estimated
 * (see street.worker.ts) and the colour says how tall a building is drawn,
 * not what it is made of. `below` is the first floor count of the next band.
 */
export const BUILDING_BANDS = [
  { below: 3, label: "1 or 2 floors", walls: ["#c9a27a", "#d8c3a0", "#b98a62", "#e0d2b6"] },
  { below: 6, label: "3 to 5 floors", walls: ["#e3dccb", "#d6cdb8", "#cfd3cf", "#e9e1d0"] },
  { below: 11, label: "6 to 10 floors", walls: ["#b9bec2", "#c9cdd0", "#aab1b6"] },
  { below: Infinity, label: "11 floors and up", walls: ["#8fa7b8", "#9fb6c4", "#7f97a8"] },
] as const;
/** Corrugated zinc, rusted zinc, painted long-span sheets, and concrete. */
export const ROOFS = {
  sheet: ["#9a9d9f", "#8a8f93", "#a5a8a8", "#8b5a3c", "#7d4f36", "#96664a", "#8a4c40", "#56708a", "#5f7559"],
  flat: ["#8e8f8c", "#7c7f81", "#9c9a93", "#6f7376"],
} as const;

/** Cheap repeatable noise in [0, 1) from an integer. */
export function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** GLSL for the haze that hides the far distance when the camera is low. */
export const FOG_GLSL = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
float fogAmount(vec3 world) {
  return smoothstep(uFogNear, uFogFar, distance(world, cameraPosition));
}
vec3 applyFog(vec3 colour, vec3 world) {
  return mix(colour, uFogColor, fogAmount(world));
}
`;

/** GLSL shared by everything that is lit by the sun. */
export const LIGHTING_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform float uOvercast;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toDisplay(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }

// 0 at night, 1 in daylight, for a place whose "up" is given.
float dayAmount(vec3 up) {
  return smoothstep(-0.10, 0.14, dot(up, uSunDir));
}

vec3 shade(vec3 albedo, vec3 n, vec3 up, float moonlight) {
  float s = dot(up, uSunDir);
  float day = smoothstep(-0.10, 0.14, s);
  vec3 ambient = mix(vec3(0.105, 0.14, 0.21), vec3(0.40, 0.45, 0.52), day);
  ambient *= 1.0 + 0.45 * uOvercast * day;
  vec3 sun = mix(vec3(1.25, 0.62, 0.30), vec3(1.0, 0.96, 0.90), smoothstep(0.02, 0.45, s));
  sun *= day * 0.62 * (1.0 - 0.85 * uOvercast);
  float ndl = max(dot(n, uSunDir), 0.0);
  // A little fixed light at night so the relief does not vanish.
  vec3 moon = vec3(0.07, 0.09, 0.14) * max(dot(n, normalize(vec3(-0.4, 0.8, -0.45))), 0.0);
  moon *= (1.0 - day) * moonlight;
  vec3 lit = albedo * (ambient + sun * ndl + moon);
  // Overcast light is flat and a little grey.
  float grey = dot(lit, vec3(0.3, 0.55, 0.15));
  return mix(lit, vec3(grey), 0.25 * uOvercast);
}
`;

/**
 * GLSL for fading out with a fixed screen-space pattern instead of blending,
 * so faded geometry needs no sorting and still writes depth.
 */
export const DITHER_GLSL = /* glsl */ `
bool dithered(float keep) {
  float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  return noise >= keep;
}
`;
