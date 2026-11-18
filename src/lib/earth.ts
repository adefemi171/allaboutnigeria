import * as THREE from "three";
import { subsolarPoint } from "@/lib/sun";

/** Building blocks shared by every globe on the site: the Sky globe, the home story and the atlas. */

/** Position of a point on a sphere whose prime meridian faces +x and north pole +y. */
export function latLonToVec3(lat: number, lon: number, radius: number, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return out.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/** Rough outline of Nigeria as [lon, lat], closed. */
export const NIGERIA_OUTLINE: [number, number][] = [
  [2.7, 6.4], [2.8, 9.2], [3.6, 11.7], [4.2, 13.7], [6.6, 13.0], [9.0, 12.9],
  [11.0, 13.2], [13.5, 13.7], [14.2, 12.4], [13.4, 10.3], [11.9, 8.7],
  [10.0, 6.7], [8.6, 4.9], [7.5, 4.3], [6.4, 4.2], [5.0, 4.8], [4.5, 5.5], [2.7, 6.4],
];

/** Phones and tablets get half-size textures and fewer pixels. */
export function isLiteDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
}

/** A WebGL canvas that fills `container` and keeps `camera` in step with its size. */
export function mountRenderer(
  container: HTMLElement,
  camera: THREE.PerspectiveCamera,
  options: { alpha?: boolean; onResize?: () => void } = {}
): { renderer: THREE.WebGLRenderer; unmount: () => void } {
  const pixelRatio = Math.min(window.devicePixelRatio, isLiteDevice() ? 1.5 : 2);
  const renderer = new THREE.WebGLRenderer({
    alpha: options.alpha,
    // Dense screens hide the jaggies antialiasing would fix
    antialias: pixelRatio < 1.5 || !isLiteDevice(),
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(pixelRatio);
  container.appendChild(renderer.domElement);

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    options.onResize?.();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  return {
    renderer,
    unmount() {
      observer.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/**
 * Call `frame` on every animation frame while `container` is on screen. On lite devices
 * the rate is halved unless `busy()` says something is moving. Returns a stop function.
 */
export function renderLoop(container: HTMLElement, frame: (nowMs: number) => void, busy?: () => boolean): () => void {
  const lite = isLiteDevice();
  let onScreen = true;
  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
  });
  visibility.observe(container);

  let frameNo = 0;
  let raf = requestAnimationFrame(function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!onScreen) return;
    if (lite && ++frameNo % 2 && !busy?.()) return;
    frame(now);
  });
  return () => {
    cancelAnimationFrame(raf);
    visibility.disconnect();
  };
}

const EARTH_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Blue Marble by day, city lights by night, blended across the terminator
const EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDir;
  uniform float opacity;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    float sun = dot(normalize(vNormal), sunDir);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb * 1.5 + day * 0.05;
    vec3 lit = day * (0.55 + 0.6 * max(sun, 0.0));
    gl_FragColor = vec4(mix(night, lit, smoothstep(-0.1, 0.15, sun)), opacity);
    #include <colorspace_fragment>
  }
`;

const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 glow;
  uniform float opacity;
  varying vec3 vNormal;
  void main() {
    // Back faces: brightest at the Earth's limb, fading to nothing at the shell's outer edge
    float rim = pow(clamp(-vNormal.z * 2.0, 0.0, 1.0), 2.5);
    gl_FragColor = vec4(glow, 1.0) * rim * 0.7 * opacity;
  }
`;

export interface Earth {
  /** The planet and its atmosphere. Rotate or move this, not the meshes inside. */
  group: THREE.Group;
  /** Light the globe as it really was at this moment. */
  setTime(ms: number): void;
  /** Put the sun directly above a place, e.g. to keep it in daylight. */
  setSunOver(lat: number, lon: number): void;
  /** Fade the planet and its glow, 0 to 1. */
  setOpacity(opacity: number): void;
}

/** The real Earth: NASA Blue Marble by day and Black Marble city lights by night. */
export function createEarth(radius: number, renderer: THREE.WebGLRenderer, glow = 0x59a6ff): Earth {
  const lite = isLiteDevice();
  const loader = new THREE.TextureLoader();
  const loadMap = (name: string) => {
    const tex = loader.load(`/textures/${name}${lite ? "-2k" : ""}.webp`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  };
  const sunDir = new THREE.Vector3(1, 0, 0);
  const opacity = { value: 1 };
  const surface = new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: loadMap("earth-day") },
      nightMap: { value: loadMap("earth-night") },
      sunDir: { value: sunDir },
      opacity,
    },
    vertexShader: EARTH_VERTEX,
    fragmentShader: EARTH_FRAGMENT,
  });

  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(new THREE.SphereGeometry(radius, lite ? 64 : 96, lite ? 48 : 64), surface),
    new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.16, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { glow: { value: new THREE.Color(glow) }, opacity },
        vertexShader: ATMOSPHERE_VERTEX,
        fragmentShader: ATMOSPHERE_FRAGMENT,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      })
    )
  );

  const earth: Earth = {
    group,
    setTime(ms) {
      const sun = subsolarPoint(new Date(ms));
      earth.setSunOver(sun.lat, sun.lon);
    },
    setSunOver(lat, lon) {
      latLonToVec3(lat, lon, 1, sunDir);
    },
    setOpacity(value) {
      opacity.value = value;
      // Blending only while fading, so a solid globe keeps the cheaper, correctly sorted opaque pass
      const fading = value < 1;
      if (surface.transparent !== fading) {
        surface.transparent = fading;
        surface.needsUpdate = true;
      }
      group.visible = value > 0;
    },
  };
  earth.setTime(Date.now());
  return earth;
}

/** Stars scattered between two radii. */
export function starfield(count: number, minRadius: number, maxRadius: number, material: THREE.PointsMaterialParameters): THREE.Points {
  const positions = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(THREE.MathUtils.lerp(minRadius, maxRadius, Math.random()));
    v.toArray(positions, i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, ...material })
  );
}

/** A line drawn on the globe through [lon, lat] points. */
export function geoLine(points: [number, number][], radius: number, material: THREE.LineBasicMaterialParameters): THREE.Line {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points.map(([lon, lat]) => latLonToVec3(lat, lon, radius))),
    new THREE.LineBasicMaterial({ transparent: true, ...material })
  );
}

/** Free every geometry, material and texture in a scene. */
export function disposeScene(scene: THREE.Scene) {
  scene.traverse((obj) => {
    const { geometry, material } = obj as THREE.Mesh;
    geometry?.dispose();
    for (const m of [material].flat()) {
      if (!m) continue;
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
      for (const u of Object.values((m as THREE.ShaderMaterial).uniforms ?? {})) {
        if (u.value instanceof THREE.Texture) u.value.dispose();
      }
      m.dispose();
    }
  });
}
