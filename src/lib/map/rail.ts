// The main railway lines: the standard-gauge lines from Lagos to Ibadan,
// Abuja to Kaduna and Itakpe to Warri, the old line from Port Harcourt to
// Kano, and the light rail in Lagos and Abuja. They come from OpenStreetMap
// at build time (public/data/map/rail.geojson) and are drawn on the model
// from orbit down to the edge of town, with trains running on them. Close
// in, the street tiles draw the track and run their own trains.

import * as THREE from "three";
import { smoothstep } from "./math";
import { INTERCITY, Movers, type Surroundings } from "./movers";
import { latLonToWorld } from "./projection";
import { FOG_GLSL, LEVEL, LIGHTING_GLSL } from "./style";
import type { SharedUniforms } from "./terrain";

/** The longest stretch of line between two points that follow the ground, km. */
const STEP = 1;

const VERTEX = /* glsl */ `
attribute vec2 aAcross;  // which way is sideways, on the ground
attribute float aGround; // height of the ground, scene km at full relief
uniform float uRelief;
uniform float uWidth;
varying vec3 vWorld;
void main() {
  vec3 p = position;
  p.xz += aAcross * uWidth;
  // A terrace above the ground, so the line is not lost in the steps of the model.
  p.y = (aGround + ${LEVEL.toFixed(2)}) * uRelief + 0.002;
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying vec3 vWorld;
${LIGHTING_GLSL}
${FOG_GLSL}
void main() {
  vec3 colour = mix(vec3(0.08, 0.07, 0.07), vec3(0.20, 0.17, 0.15), dayAmount(vec3(0.0, 1.0, 0.0)));
  gl_FragColor = vec4(applyFog(colour, vWorld), uOpacity * (1.0 - fogAmount(vWorld)));
}
`;

interface RailFile {
  features: { geometry: { coordinates: [number, number][] } }[];
}

export class Rail {
  readonly group = new THREE.Group();
  private trains: Movers;
  private mesh: THREE.Mesh | null = null;
  private uniforms = { uWidth: { value: 0.01 }, uOpacity: { value: 0 } };

  constructor(
    private shared: SharedUniforms,
    private around: Surroundings,
    phone: boolean,
    reducedMotion: boolean,
  ) {
    this.trains = new Movers(INTERCITY, around, shared, phone, reducedMotion);
    this.group.add(this.trains.mesh);
  }

  async load(url: string, signal: AbortSignal): Promise<void> {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Railways: HTTP ${response.status}`);
    const file = (await response.json()) as RailFile;

    const routes: number[] = [];
    const positions: number[] = [];
    const across: number[] = [];
    const ground: number[] = [];
    const indices: number[] = [];
    for (const { geometry } of file.features) {
      const points = geometry.coordinates.map(([lon, lat]) => latLonToWorld(lat, lon));
      if (points.length < 2) continue;
      routes.push(points.length, 0, 1, ...points.flat());

      // Short steps, so the line can follow the ground.
      const line: [number, number][] = [points[0]];
      for (let k = 1; k < points.length; k++) {
        const [ax, az] = points[k - 1];
        const [bx, bz] = points[k];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP));
        for (let s = 1; s <= steps; s++)
          line.push([ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps]);
      }
      const base = positions.length / 3;
      line.forEach(([x, z], k) => {
        const [px, pz] = line[Math.max(0, k - 1)];
        const [nx, nz] = line[Math.min(line.length - 1, k + 1)];
        const length = Math.hypot(nx - px, nz - pz) || 1;
        const sideX = -(nz - pz) / length;
        const sideZ = (nx - px) / length;
        const height = this.around.groundAt(x, z);
        for (const side of [1, -1]) {
          positions.push(x, 0, z);
          across.push(sideX * side, sideZ * side);
          ground.push(height);
        }
        if (k) {
          const a = base + (k - 1) * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      });
    }
    if (signal.aborted) return;
    this.trains.add("national", 0, 0, new Float32Array(routes));

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aAcross", new THREE.Float32BufferAttribute(across, 2));
    geometry.setAttribute("aGround", new THREE.Float32BufferAttribute(ground, 1));
    geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { ...this.shared, ...this.uniforms },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.group.add(this.mesh);
  }

  /**
   * @param daylight 0 at night, 1 by day.
   * @returns Whether a train is moving, so the map keeps drawing.
   */
  update(fx: number, fz: number, dist: number, dt: number, daylight: number, enabled: boolean): boolean {
    if (this.mesh) {
      // A couple of pixels wide at any distance, gone where the streets take over.
      this.uniforms.uWidth.value = Math.max(0.004, dist * 0.0011);
      const opacity = smoothstep(3, 6, dist) * (0.85 - 0.45 * smoothstep(1500, 4000, dist));
      this.uniforms.uOpacity.value = opacity;
      this.mesh.visible = opacity > 0.01;
    }
    return this.trains.update(fx, fz, dist, dt, daylight, enabled);
  }

  dispose(): void {
    this.trains.dispose();
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
  }
}
