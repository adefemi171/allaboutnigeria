// The Earth the model sits on: NASA's Blue Marble by day and Black Marble
// city lights by night, split by the real line between day and night, with
// a thin glow of atmosphere. The pictures are the site's own
// (public/textures), half size on a phone.

import * as THREE from "three";
import { smoothstep } from "./math";
import { EARTH_RADIUS_KM, ORIGIN } from "./projection";
import { FOG_GLSL, GLOBE_SEA, LIGHTING_GLSL } from "./style";
import type { SharedUniforms } from "./terrain";

export interface Globe {
  group: THREE.Group;
  /** Call every frame with the camera's distance to its target (km). */
  update(distance: number): void;
  dispose(): void;
}

// The model is the plane touching the globe at the origin. The sphere sits
// a little below it so the coast of the model clears it.
const SURFACE = EARTH_RADIUS_KM - 1.5;
const CENTRE = new THREE.Vector3(0, -EARTH_RADIUS_KM, 0);

const SPHERE_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vNormal = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// The scene is east, up and south at the origin. Turning a direction from
// there back into latitude and longitude finds the spot in the pictures,
// which are plain latitude-longitude maps of the whole Earth.
const SPHERE_FRAGMENT = /* glsl */ `
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform vec3 uSea;
uniform float uLoaded;
uniform vec2 uOrigin; // latitude and longitude of the origin, radians
uniform vec4 uModel;  // the model's extent: xMin, zMin, xMax, zMax
varying vec3 vNormal;
varying vec3 vWorld;
${LIGHTING_GLSL}
${FOG_GLSL}
const float PI = 3.141592653589793;
void main() {
  vec3 n = normalize(vNormal);
  float north = -n.z;
  float ey = cos(uOrigin.x) * n.y - sin(uOrigin.x) * north;
  float ez = sin(uOrigin.x) * n.y + cos(uOrigin.x) * north;
  float lat = asin(clamp(ez, -1.0, 1.0));
  float lon = uOrigin.y + atan(n.x, ey);
  vec2 uv = vec2(fract((lon + PI) / (2.0 * PI)), (lat + PI / 2.0) / PI);
  vec3 day = mix(toLinear(uSea), toLinear(texture2D(uDay, uv).rgb), uLoaded);
  // Only the lights of the night picture: its dark land is tinted blue,
  // which would turn the night side purple.
  float glow = dot(toLinear(texture2D(uNight, uv).rgb), vec3(0.3, 0.55, 0.15));
  vec3 lights = vec3(1.0, 0.72, 0.42) * smoothstep(0.02, 0.5, glow) * uLoaded;
  float sun = dayAmount(n);
  vec3 lit = shade(day, n, n, 1.0);
  vec3 colour = mix(lights * 0.9 + day * 0.03, lit, sun);
  // Under the model and its fading edge the globe is plain dark sea, as the
  // pictures sit a little off the model there (the model is flat, the globe
  // curves away) and would show through its edge in the wrong place.
  vec2 outside = max(uModel.xy - vWorld.xz, vWorld.xz - uModel.zw);
  float away = smoothstep(0.0, 300.0, max(outside.x, outside.y));
  colour = mix(shade(toLinear(uSea), n, n, 1.0), colour, away);
  gl_FragColor = vec4(toDisplay(applyFog(colour, vWorld)), 1.0);
}
`;

const AIR_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vNormal = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const AIR_FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vWorld;
${LIGHTING_GLSL}
void main() {
  vec3 n = normalize(vNormal);
  vec3 toCamera = normalize(cameraPosition - vWorld);
  // Only the back of the shell is drawn, so this is a ring around the globe:
  // strongest right at the limb, fading outwards.
  float t = clamp(-dot(n, toCamera) / 0.26, 0.0, 1.0);
  float glow = t * t * (0.18 + 0.82 * dayAmount(n));
  gl_FragColor = vec4(vec3(0.36, 0.62, 1.0) * glow * uOpacity, 1.0);
}
`;

export function buildGlobe(
  shared: SharedUniforms,
  /** The model's extent, km. */
  model: { x0: number; z0: number; x1: number; z1: number },
  lite: boolean,
  redraw: () => void,
): Globe {
  const group = new THREE.Group();
  const uniforms = {
    uDay: { value: null as THREE.Texture | null },
    uNight: { value: null as THREE.Texture | null },
    uSea: { value: new THREE.Vector3(GLOBE_SEA[0] / 255, GLOBE_SEA[1] / 255, GLOBE_SEA[2] / 255) },
    uLoaded: { value: 0 },
    uOrigin: { value: new THREE.Vector2((ORIGIN.lat * Math.PI) / 180, (ORIGIN.lon * Math.PI) / 180) },
    uModel: { value: new THREE.Vector4(model.x0, model.z0, model.x1, model.z1) },
  };

  // Until both pictures are in, the globe is a plain dark sphere.
  const loader = new THREE.TextureLoader();
  const size = lite ? "-2k" : "";
  let pending = 2;
  const load = (name: string, slot: { value: THREE.Texture | null }) => {
    slot.value = loader.load(`/textures/${name}${size}.webp`, (texture) => {
      texture.colorSpace = THREE.NoColorSpace;
      if (--pending === 0) uniforms.uLoaded.value = 1;
      redraw();
    });
  };
  load("earth-day", uniforms.uDay);
  load("earth-night", uniforms.uNight);

  const sphereGeometry = new THREE.SphereGeometry(SURFACE, lite ? 96 : 160, lite ? 64 : 112);
  const sphereMaterial = new THREE.ShaderMaterial({
    uniforms: { ...shared, ...uniforms },
    vertexShader: SPHERE_VERTEX,
    fragmentShader: SPHERE_FRAGMENT,
  });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.copy(CENTRE);
  sphere.frustumCulled = false;
  group.add(sphere);

  const airGeometry = new THREE.SphereGeometry(EARTH_RADIUS_KM * 1.035, 96, 64);
  const airMaterial = new THREE.ShaderMaterial({
    uniforms: { ...shared, uOpacity: { value: 1 } },
    vertexShader: AIR_VERTEX,
    fragmentShader: AIR_FRAGMENT,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const air = new THREE.Mesh(airGeometry, airMaterial);
  air.position.copy(CENTRE);
  air.frustumCulled = false;
  group.add(air);

  return {
    group,
    update(distance) {
      // Up close the camera is inside the shell and the glow makes no sense.
      const airOpacity = smoothstep(2500, 6000, distance);
      airMaterial.uniforms.uOpacity.value = airOpacity;
      air.visible = airOpacity > 0.01;
    },
    dispose() {
      sphereGeometry.dispose();
      sphereMaterial.dispose();
      airGeometry.dispose();
      airMaterial.dispose();
      uniforms.uDay.value?.dispose();
      uniforms.uNight.value?.dispose();
    },
  };
}
