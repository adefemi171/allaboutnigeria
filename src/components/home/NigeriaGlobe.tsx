"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { NIGERIA_STATES, type NigeriaStateProfile } from "@/data/nigeria-states";
import { NIGERIA_PLACES, type NigeriaPlace } from "@/data/nigeria-places";
import {
  NIGERIA_OUTLINE,
  createEarth,
  disposeScene,
  geoLine,
  latLonToVec3,
  mountRenderer,
  renderLoop,
  starfield,
} from "@/lib/earth";
import { NIGERIA_ORIGIN } from "@/lib/sun";

export type GlobeLayer = "all" | "states" | "universities" | "landmarks";

interface NigeriaGlobeProps {
  selectedState: NigeriaStateProfile;
  selectedPlace?: NigeriaPlace | null;
  layer?: GlobeLayer;
  onSelectState: (state: NigeriaStateProfile) => void;
  onSelectPlace?: (place: NigeriaPlace) => void;
}

/** The Niger and the Benue, meeting at Lokoja, as [lon, lat]. */
const RIVERS: [number, number][][] = [
  [[3.8, 11.4], [5.6, 9.2], [6.7, 7.8], [6.1, 5.3]],
  [[13.0, 9.4], [9.8, 8.2], [6.7, 7.8]],
];

const GLOBE_RADIUS = 1.32;

const MAJOR_SLUGS = new Set(["abuja", "kano", "rivers", "oyo", "enugu", "lagos", "cross-river", "kaduna"]);

export function NigeriaGlobe({
  selectedState,
  selectedPlace = null,
  layer = "all",
  onSelectState,
  onSelectPlace,
}: NigeriaGlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const selectedStateRef = useRef(selectedState);
  selectedStateRef.current = selectedState;
  const selectedPlaceRef = useRef(selectedPlace);
  selectedPlaceRef.current = selectedPlace;
  const layerRef = useRef<GlobeLayer>(layer);
  layerRef.current = layer;

  const onSelectStateRef = useRef(onSelectState);
  onSelectStateRef.current = onSelectState;
  const onSelectPlaceRef = useRef(onSelectPlace);
  onSelectPlaceRef.current = onSelectPlace;

  const targetRotRef = useRef({ x: 0.22, y: -1.7 });

  useEffect(() => {
    const lat = selectedPlace ? selectedPlace.lat : selectedState.lat;
    const lon = selectedPlace ? selectedPlace.lon : selectedState.lon;
    const lonRad = (lon * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;
    targetRotRef.current = {
      x: latRad + 0.06,
      y: -lonRad - Math.PI / 2,
    };
  }, [selectedState, selectedPlace]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 3.1);
    const { renderer, unmount } = mountRenderer(container, camera, { alpha: true });

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const earth = createEarth(GLOBE_RADIUS, renderer, 0x17a673);
    // An atlas is for reading: keep Nigeria in daylight whatever the hour
    earth.setSunOver(NIGERIA_ORIGIN.lat, NIGERIA_ORIGIN.lon);
    globeGroup.add(
      earth.group,
      geoLine(NIGERIA_OUTLINE, GLOBE_RADIUS * 1.002, { color: 0x10b981, opacity: 0.9 }),
      ...RIVERS.map((river) => geoLine(river, GLOBE_RADIUS * 1.002, { color: 0x38bdf8, opacity: 0.6 }))
    );

    const stars = starfield(450, 4, 10, { size: 0.018, opacity: 0.55 });
    scene.add(stars);

    interface Beacon {
      dot: THREE.Mesh;
      halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      state?: NigeriaStateProfile;
      place?: NigeriaPlace;
    }
    const beacons: Beacon[] = [];
    const addBeacon = (lat: number, lon: number, radius: number, color: string, target: Pick<Beacon, "state" | "place">) => {
      const pos = latLonToVec3(lat, lon, GLOBE_RADIUS * 1.008);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 12), new THREE.MeshBasicMaterial({ color }));
      dot.position.copy(pos);
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(radius * 1.2, radius * 2.1, 20),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true })
      );
      halo.position.copy(pos).multiplyScalar(1.003);
      halo.lookAt(pos.clone().multiplyScalar(2));
      globeGroup.add(dot, halo);
      beacons.push({ dot, halo, ...target });
    };
    for (const state of NIGERIA_STATES) {
      addBeacon(state.lat, state.lon, MAJOR_SLUGS.has(state.slug) ? 0.011 : 0.008, state.accentColor, { state });
    }
    for (const place of NIGERIA_PLACES) {
      const color = place.category === "university" ? "#a855f7" : "#f59e0b";
      addBeacon(place.lat, place.lon, place.has3DCampus ? 0.009 : 0.006, color, { place });
    }

    globeGroup.rotation.x = targetRotRef.current.x;
    globeGroup.rotation.y = targetRotRef.current.y;

    let isDragging = false;
    let dragDist = 0;
    let prevX = 0;
    let prevY = 0;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      dragDist = 0;
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      dragDist += Math.hypot(dx, dy);
      prevX = e.clientX;
      prevY = e.clientY;
      targetRotRef.current.y += dx * 0.006;
      targetRotRef.current.x = Math.max(-0.9, Math.min(0.9, targetRotRef.current.x + dy * 0.006));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isDragging && dragDist < 6) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(beacons.filter((b) => b.dot.visible).map((b) => b.dot), false)[0];
        const beacon = hit && beacons.find((b) => b.dot === hit.object);
        if (beacon?.place) onSelectPlaceRef.current?.(beacon.place);
        else if (beacon?.state) onSelectStateRef.current(beacon.state);
      }
      isDragging = false;
    };

    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    // A vertical swipe hands the touch to the page scroll
    const onPointerCancel = () => {
      isDragging = false;
    };
    window.addEventListener("pointercancel", onPointerCancel);

    const startMs = performance.now();
    const stop = renderLoop(
      container,
      (now) => {
        const t = (now - startMs) / 1000;
        globeGroup.rotation.x += (targetRotRef.current.x - globeGroup.rotation.x) * 0.08;
        globeGroup.rotation.y += (targetRotRef.current.y - globeGroup.rotation.y) * 0.08;
        stars.rotation.y += 0.0002;

        const layer = layerRef.current;
        for (const b of beacons) {
          const isUni = b.place?.category === "university";
          const show =
            layer === "all" ||
            (b.state ? layer === "states" : layer === (isUni ? "universities" : "landmarks"));
          b.dot.visible = b.halo.visible = show;
          const active = b.place
            ? selectedPlaceRef.current?.id === b.place.id
            : !selectedPlaceRef.current && b.state!.slug === selectedStateRef.current.slug;
          b.halo.scale.setScalar(active ? 1.5 + Math.sin(t * 4) * 0.35 : 0.9 + Math.sin(t * 2.2) * 0.12);
          b.halo.material.opacity = active ? 0.98 : 0.35;
        }
        renderer.render(scene, camera);
      },
      () => isDragging
    );

    return () => {
      stop();
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      disposeScene(scene);
      unmount();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      // The camera sits close enough that the globe overflows the canvas; fade its edges out
      className="h-[380px] w-full cursor-grab touch-pan-y [mask-image:radial-gradient(circle_at_center,black_55%,transparent_70%)] active:cursor-grabbing sm:h-[480px] lg:h-[540px]"
      aria-label="Interactive 3D Earth Globe showing Nigerian states, universities, and landmarks"
    />
  );
}
