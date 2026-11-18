// Street lamps. The worker says where they stand along the streets of a
// tile (see street.worker.ts); this draws them: a post with a lantern on
// an arm over the road, and after dark the pool of light under it.

import * as THREE from "three";
import { LAMP_ARM, MATERIAL, lampPost } from "./figures";
import { FOG_GLSL, LIGHTING_GLSL } from "./style";

/** Radius of the light on the ground, metres. */
const POOL = 9;

const POST_VERTEX = /* glsl */ `
attribute vec3 aLamp;   // x and z in km from the tile's corner, and which way the arm points
attribute vec3 aPart;   // as in figures.ts; only the material matters here
uniform float uLift;
uniform float uShow;
uniform float uBuild;
uniform float uLampSize;
uniform float uBuildReach;
uniform vec2 uFocus;
varying float vLantern;
varying float vShow;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  float ch = cos(aLamp.z);
  float sh = sin(aLamp.z);
  vec3 p = vec3(position.x * ch + position.z * sh, position.y, -position.x * sh + position.z * ch);
  vNormal = vec3(normal.x * ch + normal.z * sh, normal.y, -normal.x * sh + normal.z * ch);
  vec4 foot = modelMatrix * vec4(aLamp.x, 0.0, aLamp.y, 1.0);
  float near = 1.0 - smoothstep(uBuildReach * 0.75, uBuildReach, distance(foot.xz, uFocus));
  vShow = uShow * uBuild * near;
  vLantern = step(${MATERIAL.lantern - 0.5}, aPart.z);
  vec3 local = vec3(aLamp.x, uLift, aLamp.y) + p * (0.001 * uLampSize * vShow);
  vWorld = (modelMatrix * vec4(local, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
}
`;

const POST_FRAGMENT = /* glsl */ `
varying float vLantern;
varying float vShow;
varying vec3 vNormal;
varying vec3 vWorld;
${LIGHTING_GLSL}
${FOG_GLSL}
void main() {
  if (vShow < 0.01) discard;
  vec3 up = vec3(0.0, 1.0, 0.0);
  // Galvanised steel posts; the lantern is pale by day.
  vec3 albedo = toLinear(mix(vec3(0.42, 0.45, 0.46), vec3(0.86, 0.86, 0.82), vLantern));
  vec3 colour = shade(albedo, normalize(vNormal), up, 1.0);
  colour += vec3(1.0, 0.78, 0.45) * vLantern * (1.0 - dayAmount(up)) * 1.6;
  gl_FragColor = vec4(toDisplay(applyFog(colour, vWorld)), 1.0);
}
`;

const POOL_VERTEX = /* glsl */ `
attribute vec3 aLamp;
uniform float uLift;
uniform float uShow;
uniform float uBuild;
uniform float uLampSize;
uniform float uBuildReach;
uniform vec2 uFocus;
varying vec2 vDisc;
varying float vShow;
varying vec3 vWorld;
void main() {
  // Centred under the lantern, which hangs out over the road.
  vec2 arm = vec2(sin(aLamp.z), cos(aLamp.z)) * ${LAMP_ARM.toFixed(1)};
  vec2 on = aLamp.xy + (arm + position.xy * ${POOL.toFixed(1)}) * 0.001 * uLampSize;
  vec4 world = modelMatrix * vec4(on.x, uLift * 1.5, on.y, 1.0);
  float near = 1.0 - smoothstep(uBuildReach * 0.75, uBuildReach, distance(world.xz, uFocus));
  vShow = uShow * uBuild * near;
  vDisc = position.xy;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const POOL_FRAGMENT = /* glsl */ `
varying vec2 vDisc;
varying float vShow;
varying vec3 vWorld;
${LIGHTING_GLSL}
${FOG_GLSL}
void main() {
  float fall = 1.0 - smoothstep(0.0, 1.0, length(vDisc));
  float night = 1.0 - dayAmount(vec3(0.0, 1.0, 0.0));
  float alpha = fall * fall * night * vShow * (1.0 - fogAmount(vWorld)) * 0.3;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(1.0, 0.76, 0.42, alpha);
}
`;

function poolGeometry(): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

/**
 * The lamps of one tile: their posts, and their light on the ground.
 * @param lamps x, z and heading for every lamp, as the worker sends them.
 */
export function lampMeshes(
  lamps: Float32Array,
  uniforms: Record<string, THREE.IUniform>,
): { posts: THREE.Mesh; pools: THREE.Mesh } {
  const where = new THREE.InstancedBufferAttribute(lamps, 3);
  const make = (geometry: THREE.InstancedBufferGeometry, material: THREE.ShaderMaterial) => {
    geometry.setAttribute("aLamp", where);
    geometry.instanceCount = lamps.length / 3;
    const mesh = new THREE.Mesh(geometry, material);
    // The lamps are placed by the shader, so the mesh has no size of its own.
    mesh.frustumCulled = false;
    return mesh;
  };
  const posts = make(
    lampPost(),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: POST_VERTEX,
      fragmentShader: POST_FRAGMENT,
      side: THREE.DoubleSide,
    }),
  );
  const pools = make(
    poolGeometry(),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: POOL_VERTEX,
      fragmentShader: POOL_FRAGMENT,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  // Over the ground, which is drawn at 1.
  pools.renderOrder = 2;
  return { posts, pools };
}
