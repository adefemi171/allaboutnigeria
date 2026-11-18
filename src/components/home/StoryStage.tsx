"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { NIGERIA_STATES } from "@/data/nigeria-states";
import {
  NIGERIA_OUTLINE,
  createEarth,
  disposeScene,
  geoLine,
  isLiteDevice,
  latLonToVec3,
  mountRenderer,
  renderLoop,
  starfield,
} from "@/lib/earth";
import { NIGERIA_ORIGIN, sunDirection, sunPosition } from "@/lib/sun";

export type StoryPose = {
  x: number;
  z: number;
  dist: number;
  az: number;
  tilt: number;
  shiftX: number;
  shiftY: number;
};

export type StoryFrame = {
  index: number;
  hold: number;
  travel: number;
  past: boolean;
  sceneId: string;
  /** 0 at globe, 1 at country, 2 at zones, 3 at city */
  progress: number;
  /** Flood/overlay amount for the zones scene (0–1) */
  zoneFill: number;
};

type Props = {
  frame: StoryFrame;
  pose: StoryPose;
  active: boolean;
};

/** Rough relative population weights for block heights. */
const POP_WEIGHT: Record<string, number> = {
  lagos: 1,
  kano: 0.72,
  rivers: 0.48,
  kaduna: 0.55,
  oyo: 0.52,
  katsina: 0.45,
  bauchi: 0.42,
  jigawa: 0.38,
  benue: 0.4,
  anambra: 0.38,
  borno: 0.36,
  delta: 0.4,
  niger: 0.35,
  imo: 0.34,
  "akwa-ibom": 0.36,
  ogun: 0.38,
  sokoto: 0.32,
  osun: 0.3,
  ondo: 0.3,
  abuja: 0.28,
  enugu: 0.28,
  edo: 0.28,
  plateau: 0.26,
  "cross-river": 0.24,
  abia: 0.24,
  adamawa: 0.26,
  kebbi: 0.26,
  taraba: 0.22,
  kwara: 0.22,
  kogi: 0.24,
  gombe: 0.2,
  yobe: 0.2,
  ebonyi: 0.18,
  nasarawa: 0.18,
  bayelsa: 0.16,
  ekiti: 0.16,
  zamfara: 0.28,
};

/** The flat map is centred here; the globe touches the map at this point when it flattens. */
const MAP_CENTRE = { lat: 9, lon: 8 };
const MAP_UNITS_PER_DEG = 4.2;

function lonLatToXZ(lon: number, lat: number): [number, number] {
  return [(lon - MAP_CENTRE.lon) * MAP_UNITS_PER_DEG, (MAP_CENTRE.lat - lat) * MAP_UNITS_PER_DEG];
}

function applyPose(camera: THREE.PerspectiveCamera, pose: StoryPose, aspect: number) {
  const az = (pose.az * Math.PI) / 180;
  const tilt = (pose.tilt * Math.PI) / 180;
  const ox = Math.sin(az) * Math.cos(tilt) * pose.dist;
  const oy = Math.sin(tilt) * pose.dist;
  const oz = Math.cos(az) * Math.cos(tilt) * pose.dist;

  camera.position.set(pose.x + ox, oy, pose.z + oz);
  camera.lookAt(pose.x, 0, pose.z);

  // Shift framing so copy on the left (or bottom on mobile) stays clear.
  const fov = camera.fov * (Math.PI / 180);
  const viewH = 2 * Math.tan(fov / 2) * pose.dist;
  const viewW = viewH * aspect;
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
  camera.position.addScaledVector(right, pose.shiftX * viewW);
  camera.position.addScaledVector(up, pose.shiftY * viewH);
  camera.lookAt(pose.x, 0, pose.z);
  // Labels are projected before the next render, so the matrices must be current now
  camera.updateMatrixWorld();
}

const GLOBE_RADIUS = 18;
/** Globe scale at which a degree on its surface is as long as a degree on the flat map. */
const FLAT_SCALE = (MAP_UNITS_PER_DEG * 180) / (Math.PI * GLOBE_RADIUS);
/** Opening size, so the whole globe fits beside the hero text. */
const OPENING_SCALE = 1.25;

/** Rotation that lays the map centre on top of the globe, east along +x and north along −z like the map. */
function flatRotation(): THREE.Quaternion {
  const up = latLonToVec3(MAP_CENTRE.lat, MAP_CENTRE.lon, 1);
  const east = latLonToVec3(MAP_CENTRE.lat, MAP_CENTRE.lon + 0.01, 1).sub(up).normalize();
  const south = east.clone().cross(up);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, up, south).transpose());
}

export function StoryStage({ frame, pose, active }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const apiRef = useRef<{
    setPose: (p: StoryPose, f: StoryFrame) => void;
    setActive: (v: boolean) => void;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1620);
    scene.fog = new THREE.FogExp2(0x0b1620, 0.0018);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 80000);
    // A resize while paused still needs one fresh frame
    let needsFrame = true;
    const { renderer, unmount } = mountRenderer(container, camera, {
      onResize: () => {
        needsFrame = true;
      },
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const ambient = new THREE.AmbientLight(0xb8c8d8, 0.55);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.65);
    sun.position.set(40, 60, 20);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x5ba4e5, 0.35);
    rim.position.set(-30, 10, -40);
    scene.add(rim);

    const stars = starfield(isLiteDevice() ? 400 : 900, 80, 300, { size: 0.35, opacity: 0.55 });
    scene.add(stars);
    const starMat = stars.material as THREE.PointsMaterial;

    const applyDeviceSky = () => {
      const now = new Date();
      const { altitude } = sunPosition(now, NIGERIA_ORIGIN.lat, NIGERIA_ORIGIN.lon);
      const [sx, sy, sz] = sunDirection(now, NIGERIA_ORIGIN.lat, NIGERIA_ORIGIN.lon);
      const dayFactor = THREE.MathUtils.clamp((altitude + 6) / 28, 0, 1);
      const nightFactor = 1 - dayFactor;
      const golden =
        altitude > -4 && altitude < 12
          ? 1 - Math.abs(altitude - 4) / 16
          : 0;

      sun.position.set(sx * 120, Math.max(8, sy * 120), sz * 120);
      sun.intensity = 0.35 + dayFactor * 1.55;
      sun.color.setHex(0xfff1d6).lerp(new THREE.Color(0xff9248), golden * 0.7);
      ambient.intensity = 0.22 + dayFactor * 0.45;
      rim.intensity = 0.18 + nightFactor * 0.28;
      starMat.opacity = 0.12 + nightFactor * 0.55;

      const daySky = new THREE.Color(0x0f2436);
      const nightSky = new THREE.Color(0x070d14);
      const goldenSky = new THREE.Color(0x1a1520);
      const sky = nightSky.clone().lerp(daySky, dayFactor).lerp(goldenSky, golden * 0.35);
      scene.background = sky;
      if (scene.fog) {
        (scene.fog as THREE.FogExp2).color.copy(sky);
        (scene.fog as THREE.FogExp2).density = 0.0014 + nightFactor * 0.0008;
      }
      renderer.toneMappingExposure = 0.88 + dayFactor * 0.28;
    };
    applyDeviceSky();

    // ---- Globe layer
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    const earth = createEarth(GLOBE_RADIUS, renderer);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x00a862 })
    );
    latLonToVec3(NIGERIA_ORIGIN.lat, NIGERIA_ORIGIN.lon, GLOBE_RADIUS * 1.01, marker.position);
    globeGroup.add(
      earth.group,
      geoLine(NIGERIA_OUTLINE, GLOBE_RADIUS * 1.003, { color: 0x00a862, opacity: 0.9 }),
      marker
    );

    // The globe pivots on the map centre: facing the camera at the opening, it grows and turns
    // until that point lies flat under the camera, then hands over to the flat map
    const centreDir = latLonToVec3(MAP_CENTRE.lat, MAP_CENTRE.lon, 1);
    const flat = flatRotation();
    const facingCamera = new THREE.Quaternion();
    const turned = new THREE.Quaternion();
    const sway = new THREE.Quaternion();
    const UP = new THREE.Vector3(0, 1, 0);
    const cameraDir = new THREE.Vector3();
    const markerWorld = new THREE.Vector3();
    const globeOverlays = [marker.material, (globeGroup.children[1] as THREE.Line).material] as THREE.Material[];
    for (const m of globeOverlays) m.transparent = true;

    // ---- Country / zones heightfield
    const countryGroup = new THREE.Group();
    countryGroup.visible = false;
    scene.add(countryGroup);

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0e1a26,
      roughness: 1,
      metalness: 0,
      transparent: true,
      depthWrite: false,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    countryGroup.add(ground);

    const dotMat = new THREE.PointsMaterial({
      color: 0x8aa0b4,
      size: 0.08,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x00a862, transparent: true, opacity: 0.85 });

    // Dot grid sea
    {
      const pts: number[] = [];
      for (let x = -55; x <= 55; x += 2.2) {
        for (let z = -55; z <= 55; z += 2.2) {
          pts.push(x, 0.02, z);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      countryGroup.add(
        new THREE.Points(
          geo,
          dotMat
        )
      );
    }

    // Outline
    {
      const pts: number[] = [];
      NIGERIA_OUTLINE.forEach(([lon, lat]) => {
        const [x, z] = lonLatToXZ(lon, lat);
        pts.push(x, 0.05, z);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      countryGroup.add(
        new THREE.Line(geo, outlineMat)
      );
    }

    const blocks: THREE.Mesh[] = [];
    const zoneColors: Record<string, number> = {
      "South-West": 0xd96b27,
      FCT: 0x6b92b0,
      "South-South": 0x2dd4bf,
      "South-East": 0xa855f7,
      "North-West": 0xf2c14e,
      "North-Central": 0x5ba4e5,
      "North-East": 0xc2583d,
    };

    for (const st of NIGERIA_STATES) {
      const [x, z] = lonLatToXZ(st.lon, st.lat);
      const w = POP_WEIGHT[st.slug] ?? 0.2;
      const h = 0.6 + w * 14;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.35, h, 1.35),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(st.accentColor),
          roughness: 0.55,
          metalness: 0.15,
          emissive: new THREE.Color(zoneColors[st.zone] ?? 0x222222),
          emissiveIntensity: 0.08,
        })
      );
      mesh.position.set(x, h / 2, z);
      mesh.userData = { baseY: h / 2, slug: st.slug, zone: st.zone, name: st.capital };
      countryGroup.add(mesh);
      blocks.push(mesh);
    }

    // Flood plane for zones scene
    const flood = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({
        color: 0x1f6fae,
        transparent: true,
        opacity: 0,
        roughness: 0.35,
        metalness: 0.2,
        depthWrite: false,
      })
    );
    flood.rotation.x = -Math.PI / 2;
    flood.position.y = -2;
    countryGroup.add(flood);

    // ---- City tease (simple extruded blocks around Abuja)
    const cityGroup = new THREE.Group();
    cityGroup.visible = false;
    scene.add(cityGroup);
    {
      const [cx, cz] = lonLatToXZ(7.49, 9.06);
      cityGroup.position.set(cx, 0, cz);
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.4, 0.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x243748, roughness: 0.7 })
      );
      pad.position.y = 0.1;
      cityGroup.add(pad);
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const r = 0.6 + (i % 5) * 0.35;
        const h = 0.5 + (i % 7) * 0.45;
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, h, 0.28),
          new THREE.MeshStandardMaterial({
            color: i % 4 === 0 ? 0xe9e5db : 0x6b92b0,
            roughness: 0.6,
            emissive: 0x00a862,
            emissiveIntensity: i % 5 === 0 ? 0.15 : 0,
          })
        );
        b.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
        cityGroup.add(b);
      }
      // Aso Rock stub
      const rock = new THREE.Mesh(
        new THREE.ConeGeometry(0.7, 1.8, 5),
        new THREE.MeshStandardMaterial({ color: 0x8a8f8a, roughness: 0.9 })
      );
      rock.position.set(1.4, 0.9, -1.1);
      cityGroup.add(rock);
    }

    // Labels overlay
    const labelEls: { el: HTMLDivElement; x: number; z: number; rank: number }[] = [];
    const labelsRoot = labelsRef.current;
    if (labelsRoot) {
      labelsRoot.innerHTML = "";
      const majors = NIGERIA_STATES.filter((s) =>
        ["abuja", "lagos", "kano", "rivers", "enugu", "oyo", "kaduna", "borno"].includes(s.slug)
      );
      for (const st of majors) {
        const [x, z] = lonLatToXZ(st.lon, st.lat);
        const el = document.createElement("div");
        el.className = "story-label";
        // "Lagos (Ikeja / Island)" -> "Lagos"
        el.textContent = st.capital.replace(/\s*\(.*\)$/, "");
        labelsRoot.appendChild(el);
        labelEls.push({ el, x, z, rank: st.slug === "abuja" || st.slug === "lagos" ? 1 : 2 });
      }
      const country = document.createElement("div");
      country.className = "story-label story-label--country";
      country.textContent = "Nigeria";
      labelsRoot.appendChild(country);
      labelEls.push({ el: country, x: 0, z: 0, rank: 0 });
    }

    let currentPose = { ...pose };
    let currentFrame = { ...frame };
    let isActive = active;
    let loaded = false;

    const labelPos = new THREE.Vector3();
    const projectLabel = (x: number, y: number, z: number) => {
      const v = labelPos.set(x, y, z).project(camera);
      return {
        left: (v.x * 0.5 + 0.5) * 100,
        top: (-v.y * 0.5 + 0.5) * 100,
        behind: v.z > 1,
      };
    };

    const tick = (now: number) => {
      // Scrolled past the story: the last frame stays on the canvas, nothing more is drawn
      if (!isActive && !needsFrame) return;
      needsFrame = false;

      const f = currentFrame;
      const p = currentPose;
      applyPose(camera, p, camera.aspect);

      // Layer visibility by progress: 0 globe, 1 country, 2 zones, 3 city
      const prog = f.progress;
      // The globe is fully flat (and lines up with the map) before the cross-fade ends
      const flatten = THREE.MathUtils.smoothstep(prog, 0, 0.75);
      const globeFade = 1 - THREE.MathUtils.smoothstep(prog, 0.6, 0.85);
      const countryFade = THREE.MathUtils.smoothstep(prog, 0.6, 0.85);
      const blocksRise = THREE.MathUtils.smoothstep(prog, 0.72, 1.05);
      const cityOpacity = THREE.MathUtils.clamp((prog - 2.2) / 0.8, 0, 1);

      globeGroup.visible = globeFade > 0;
      countryGroup.visible = countryFade > 0;
      cityGroup.visible = cityOpacity > 0.02 || f.sceneId === "nin";

      if (globeGroup.visible) {
        if (prog < 0.02) {
          facingCamera.setFromUnitVectors(centreDir, cameraDir.copy(camera.position).normalize());
        }
        // A slow sway rather than a spin, so Nigeria never drifts out of view; it settles as the globe flattens
        sway.setFromAxisAngle(UP, Math.sin(now / 9000) * 0.12 * (1 - flatten));
        turned.copy(sway).multiply(facingCamera).slerp(flat, flatten);
        const scale = OPENING_SCALE * (FLAT_SCALE / OPENING_SCALE) ** flatten;
        globeGroup.quaternion.copy(turned);
        globeGroup.scale.setScalar(scale);
        // The pin keeps its on-screen size while the globe under it grows
        marker.scale.setScalar(OPENING_SCALE / scale);
        // Keep the map centre pinned to the origin, where the flat map's centre is
        globeGroup.position.copy(centreDir).applyQuaternion(turned).multiplyScalar(-GLOBE_RADIUS * scale);
        earth.setOpacity(globeFade);
        for (const m of globeOverlays) m.opacity = globeFade;
        earth.setTime(Date.now());
      }

      groundMat.opacity = countryFade;
      dotMat.opacity = 0.35 * countryFade;
      outlineMat.opacity = 0.85 * countryFade;
      for (const b of blocks) {
        const rise = Math.max(0.001, blocksRise);
        b.scale.y = rise;
        b.position.y = b.userData.baseY * rise;
      }

      // Flood rise during zones hold
      const floodMat = flood.material as THREE.MeshStandardMaterial;
      floodMat.opacity = f.zoneFill * 0.45;
      flood.position.y = -1.5 + f.zoneFill * 2.2;

      // Soft emissive pulse on zone blocks when flooding
      for (const b of blocks) {
        const mat = b.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.08 + f.zoneFill * 0.35;
        if (f.zoneFill > 0.05) {
          const submerged = b.position.y < flood.position.y + 0.2;
          mat.opacity = submerged ? 0.35 : 1;
          mat.transparent = submerged;
        } else {
          mat.opacity = 1;
          mat.transparent = false;
        }
      }

      cityGroup.scale.setScalar(0.15 + cityOpacity * 0.85);

      // Labels
      if (labelsRoot) {
        const showCountry = prog < 0.55;
        const showCities = prog >= 0.45 && prog < 2.6;
        for (const lab of labelEls) {
          if (lab.rank === 0) {
            lab.el.style.display = showCountry ? "block" : "none";
            marker.getWorldPosition(markerWorld);
            const pr = projectLabel(markerWorld.x, markerWorld.y + 0.6, markerWorld.z);
            if (prog < 0.4) {
              lab.el.style.left = `${pr.left}%`;
              lab.el.style.top = `${pr.top}%`;
            } else {
              const pr2 = projectLabel(0, 2, 0);
              lab.el.style.left = `${pr2.left}%`;
              lab.el.style.top = `${pr2.top}%`;
            }
          } else {
            lab.el.style.display = showCities ? "block" : "none";
            const h = 1.5;
            const pr = projectLabel(lab.x, h, lab.z);
            lab.el.style.left = `${pr.left}%`;
            lab.el.style.top = `${pr.top}%`;
            lab.el.style.opacity = pr.behind ? "0" : "1";
          }
        }
      }

      stars.rotation.y += 0.00012;
      renderer.render(scene, camera);

      if (!loaded && noticeRef.current) {
        loaded = true;
        noticeRef.current.hidden = true;
      }
    };
    const stop = renderLoop(container, tick, () => true);

    const skyTimer = window.setInterval(applyDeviceSky, 30000);

    apiRef.current = {
      setPose: (next, nextFrame) => {
        currentPose = next;
        currentFrame = nextFrame;
      },
      setActive: (v) => {
        isActive = v;
      },
    };

    return () => {
      stop();
      window.clearInterval(skyTimer);
      apiRef.current = null;
      disposeScene(scene);
      unmount();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiRef.current?.setPose(pose, frame);
  }, [pose, frame]);

  useEffect(() => {
    apiRef.current?.setActive(active);
  }, [active]);

  return (
    <div className="stage story__stage" data-stage>
      <div ref={mountRef} className="stage__canvas-wrap" />
      <div ref={labelsRef} className="stage__labels" aria-hidden="true" />
      <p ref={noticeRef} className="stage__notice mono">
        Loading the map
      </p>
    </div>
  );
}
