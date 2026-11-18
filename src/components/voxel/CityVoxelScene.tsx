"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Search,
  Sun,
  CloudRain,
  Cloud,
  Sparkles,
  Wind,
  Eye,
  Footprints,
  Bus,
  Ship,
  ArrowRight,
  X,
  Compass,
  SlidersHorizontal,
  ChevronRight,
  MapPin,
  ChevronDown,
  ChevronUp,
  Flag,
  GraduationCap,
  Minimize2,
  Maximize2,
} from "lucide-react";
import { openFeedbackModal } from "@/components/FeedbackWidget";
import { LAGOS_LANDMARKS } from "@/data/lagos-landmarks";
import { NIGERIA_STATES, getStateBySlug } from "@/data/nigeria-states";
import {
  NIGERIA_PLACES,
  getPlaceByCampusSlug,
  getPlacesForState,
  type NigeriaPlace,
} from "@/data/nigeria-places";
import { disposeScene, isLiteDevice, mountRenderer, renderLoop } from "@/lib/earth";
import { nigeriaClockParts } from "@/lib/sun";
import {
  buildChunkGeometry,
  buildPaletteRgb,
  CHUNK_CELLS,
  latLonToWorldMeters,
  parseLagosBinary,
  readWorldBinary,
  routeMidLatLon,
  type LagosMeta,
  type OsmPoi,
  type RouteLine,
} from "@/lib/lagos-voxel-mesher";
import {
  PEDESTRIAN_NAMES,
  buildPedestrianMesh,
  buildVehicleMesh,
  routeLengths,
  sampleRoutePoint,
  vehicleLabel,
  type PedestrianInstance,
  type VehicleInstance,
  type VehicleKind,
} from "./actors";

type WeatherMode = "typical" | "clear" | "harmattan" | "cloudy" | "rain";
type ControlMode = "orbit" | "street" | "pedestrian" | "ride";

type NavHitKind = "street" | "stop" | "landmark";

interface NavSearchHit {
  id: string;
  kind: NavHitKind;
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
}

interface UnifiedLandmark {
  id: string;
  name: string;
  district: string;
  lat: number;
  lon: number;
  elevationM: number;
  importance: 1 | 2 | 3;
  category: "landmark" | "district" | "bridge" | "transit" | "culture" | "university";
  summary: string;
  vibeNote: string;
  rentEstimate: string;
  guideSlug: string;
  campusSlug?: string;
}

const LAGOS_CAMERA_PRESETS: Record<
  string,
  { label: string; lat: number; lon: number; offset: [number, number, number] }
> = {
  overview: { label: "Lagoon Overview", lat: 6.442, lon: 3.416, offset: [-950, 720, 1250] },
  marina: { label: "Marina & NECOM", lat: 6.448, lon: 3.394, offset: [-420, 290, 480] },
  "victoria-island": { label: "Victoria Island", lat: 6.43, lon: 3.423, offset: [-480, 320, 560] },
  "lekki-link": { label: "Lekki-Ikoyi Bridge", lat: 6.4437, lon: 3.4455, offset: [-380, 210, 440] },
  "third-mainland": { label: "Third Mainland Bridge", lat: 6.461, lon: 3.405, offset: [480, 260, 520] },
  ikoyi: { label: "Old Ikoyi", lat: 6.4519, lon: 3.4272, offset: [-420, 270, 460] },
};

function formatHour(h: number): string {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  const tag =
    h >= 5.5 && h < 7.5
      ? "dawn"
      : h >= 7.5 && h < 11.5
      ? "morning"
      : h >= 11.5 && h < 16.0
      ? "midday"
      : h >= 16.0 && h < 18.75
      ? "golden hour"
      : "Nigeria night";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} · ${tag}`;
}

function formatDayOfYear(day: number): string {
  const d = new Date(2026, 0, day);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const LANDMARK_DOT: Record<UnifiedLandmark["category"], string> = {
  university: "bg-[#a855f7]",
  bridge: "bg-[#38bdf8]",
  transit: "bg-[#10b981]",
  culture: "bg-[#ec4899]",
  landmark: "bg-[#f59e0b]",
  district: "bg-[#f59e0b]",
};

const isSmallScreen = () => window.innerWidth < 1024;

/** Fly / Street / Ride / Ferry switch, shared by the full panel and the minimized dock. */
function ModeButtons({
  mode,
  onFerry,
  rideName,
  actions,
  className,
}: {
  mode: ControlMode;
  /** True while riding a ferry rather than a road vehicle. */
  onFerry: boolean;
  rideName: string;
  actions: RefObject<SceneActions | null>;
  className: string;
}) {
  const buttons = [
    { label: "Fly", icon: Eye, active: mode === "orbit", on: "bg-[#00a862] text-[#0b1620]", run: () => actions.current?.exitToFly() },
    {
      label: "Street",
      icon: Footprints,
      active: mode === "street" || mode === "pedestrian",
      on: "bg-[#10b981] font-semibold text-[#09090b]",
      run: () => actions.current?.enterStreetView(),
    },
    {
      label: rideName,
      icon: Bus,
      active: mode === "ride" && !onFerry,
      on: "bg-[#f59e0b] text-[#09090b]",
      run: () => actions.current?.cycleRide("danfo"),
    },
    {
      label: "Ferry",
      icon: Ship,
      active: mode === "ride" && onFerry,
      on: "bg-[#38bdf8] text-[#09090b]",
      run: () => actions.current?.cycleRide("ferry"),
    },
  ];
  return (
    <>
      {buttons.map(({ label, icon: Icon, active, on, run }) => (
        <button
          key={label}
          onClick={run}
          className={`flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition ${className} ${
            active ? on : "text-[#b6b4ad] hover:text-white"
          }`}
        >
          <Icon className="h-3 w-3" />
          {label}
        </button>
      ))}
    </>
  );
}

interface SceneActions {
  flyToLatLon: (lat: number, lon: number, offset?: [number, number, number]) => void;
  cycleRide: (preferredKind?: VehicleKind) => void;
  enterStreetView: (lat?: number, lon?: number) => void;
  followNextPedestrian: () => void;
  togglePedestrianFpv: () => void;
  exitToFly: () => void;
}

export function CityVoxelScene({
  stateSlug = "lagos",
  campusSlug,
  initialView,
}: {
  stateSlug?: string;
  campusSlug?: string;
  initialView?: string;
}) {
  const router = useRouter();
  const campusProfile = useMemo(
    () => (campusSlug ? getPlaceByCampusSlug(campusSlug) : undefined),
    [campusSlug]
  );
  const stateProfile = useMemo(
    () => getStateBySlug(campusProfile ? campusProfile.stateSlug : stateSlug) || NIGERIA_STATES[0],
    [campusProfile, stateSlug]
  );
  const isCampus = Boolean(campusProfile);
  const isLagos = !isCampus && stateProfile.slug === "lagos";

  const activeLat = campusProfile ? campusProfile.lat : stateProfile.lat;
  const activeLon = campusProfile ? campusProfile.lon : stateProfile.lon;
  const activeTitle = campusProfile ? campusProfile.shortName : stateProfile.capital;
  const activeSub = campusProfile ? campusProfile.state : stateProfile.state;

  const statePlaces = useMemo(
    () => getPlacesForState(stateProfile.slug),
    [stateProfile.slug]
  );

  const [osmPois, setOsmPois] = useState<UnifiedLandmark[]>([]);
  const [walkRoutes, setWalkRoutes] = useState<RouteLine[]>([]);
  const [transitStops, setTransitStops] = useState<OsmPoi[]>([]);
  const walkRoutesRef = useRef<RouteLine[]>([]);
  walkRoutesRef.current = walkRoutes;

  const landmarks: UnifiedLandmark[] = useMemo(() => {
    const base: UnifiedLandmark[] = isCampus && campusProfile
      ? [
          {
            id: campusProfile.id,
            name: campusProfile.name,
            district: `${campusProfile.city} · ${campusProfile.state}`,
            lat: campusProfile.lat,
            lon: campusProfile.lon,
            elevationM: campusProfile.elevationM,
            importance: 1,
            category: "university",
            summary: campusProfile.summary,
            vibeNote: campusProfile.vibeNote,
            rentEstimate: campusProfile.foundedOrStat || "University Campus",
            guideSlug: campusProfile.guideSlug,
          },
        ]
      : isLagos
      ? LAGOS_LANDMARKS.map((l) => ({ ...l }))
      : stateProfile.landmarks.map((l) => ({
          ...l,
          district: `${stateProfile.capital} · ${stateProfile.state}`,
          importance: 1 as const,
          rentEstimate: stateProfile.rentMonthlyRange,
        }));

    // Merge statePlaces (universities & landmarks) that sit inside the active voxel grid bounds
    const maxW = isLagos ? 3800 : isCampus ? 1280 : 1780;
    const maxH = isLagos ? 2500 : isCampus ? 1000 : 1260;
    for (const pl of statePlaces) {
      if (base.some((b) => b.name === pl.name)) continue;
      const [wx, wz] = latLonToWorldMeters(pl.lat, pl.lon, activeLat, activeLon);
      if (Math.abs(wx) <= maxW && Math.abs(wz) <= maxH) {
        base.push({
          id: pl.id,
          name: pl.shortName,
          district: `${pl.city} · ${pl.state}`,
          lat: pl.lat,
          lon: pl.lon,
          elevationM: pl.elevationM,
          importance: 1,
          category: pl.category === "university" ? "university" : "culture",
          summary: pl.summary,
          vibeNote: pl.vibeNote,
          rentEstimate: pl.foundedOrStat || pl.category,
          guideSlug: pl.guideSlug,
          campusSlug: pl.campusSlug,
        });
      }
    }

    // Merge extracted real OpenStreetMap campus/city POIs
    for (const poi of osmPois) {
      if (!base.some((b) => b.name.toLowerCase() === poi.name.toLowerCase())) {
        base.push(poi);
      }
    }
    return base;
  }, [isCampus, campusProfile, isLagos, stateProfile, statePlaces, activeLat, activeLon, osmPois]);

  const containerRef = useRef<HTMLDivElement>(null);
  const labelsLayerRef = useRef<HTMLDivElement>(null);
  const landmarkWorldRef = useRef<{ lm: UnifiedLandmark; pos: THREE.Vector3 }[]>([]);
  landmarkWorldRef.current = useMemo(
    () =>
      landmarks.map((lm) => {
        const [wx, wz] = latLonToWorldMeters(lm.lat, lm.lon, activeLat, activeLon);
        return { lm, pos: new THREE.Vector3(wx, lm.elevationM + 14, wz) };
      }),
    [landmarks, activeLat, activeLon]
  );

  const [loadProgress, setLoadProgress] = useState<{ label: string; pct: number } | null>({
    label: `Loading ${activeTitle} (${activeSub}) OpenStreetMap voxels…`,
    pct: 12,
  });
  // Fixed starting values so the prerendered page matches; the live-clock effect below sets the real time
  const [hour, setHour] = useState(12);
  const [dayOfYear, setDayOfYear] = useState(1);
  const [liveClock, setLiveClock] = useState(true);
  const [weather, setWeather] = useState<WeatherMode>(
    activeLat > 10 ? "harmattan" : "typical"
  );
  const [renderScale, setRenderScale] = useState(0.85);
  const [controlMode, setControlMode] = useState<ControlMode>("orbit");
  const [searchQuery, setSearchQuery] = useState("");
  const [stateSwitcherOpen, setStateSwitcherOpen] = useState(false);
  const [switcherTab, setSwitcherTab] = useState<"states" | "universities">("states");
  const [placesDrawerOpen, setPlacesDrawerOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState("");
  const [selectedLandmark, setSelectedLandmark] = useState<UnifiedLandmark | null>(null);
  const [rideInfo, setRideInfo] = useState<{ kind: string; route: string; speedKmh: number } | null>(
    null
  );
  const [streetInfo, setStreetInfo] = useState<{
    streetName: string;
    personName?: string;
    firstPerson?: boolean;
  } | null>(null);
  const [hudStats, setHudStats] = useState({
    fps: 60,
    chunks: 0,
    totalChunks: 0,
    trisM: "0.0",
    buildingsCount: 0,
  });
  const [controlsOpen, setControlsOpen] = useState(true);
  const [topPanelOpen, setTopPanelOpen] = useState(true);
  const [telemetryOpen, setTelemetryOpen] = useState(true);
  const [hudHidden, setHudHidden] = useState(false);

  // Start compact on phones so the scene isn't covered
  useEffect(() => {
    if (window.innerWidth >= 768) return;
    setControlsOpen(false);
    setTelemetryOpen(false);
    setRenderScale(0.7);
  }, []);

  // Keep sky + sun locked to the device clock (WAT) until the visitor scrubs.
  useEffect(() => {
    if (!liveClock) return;
    const sync = () => {
      const next = nigeriaClockParts();
      setHour(next.hour);
      setDayOfYear(next.dayOfYear);
    };
    sync();
    const id = window.setInterval(sync, 30000);
    return () => window.clearInterval(id);
  }, [liveClock]);

  const hourRef = useRef(hour);
  hourRef.current = hour;
  const dayRef = useRef(dayOfYear);
  dayRef.current = dayOfYear;
  const weatherRef = useRef(weather);
  weatherRef.current = weather;
  const renderScaleRef = useRef(renderScale);
  renderScaleRef.current = renderScale;
  const controlModeRef = useRef(controlMode);
  controlModeRef.current = controlMode;
  const streetFpvRef = useRef(false);
  streetFpvRef.current = Boolean(streetInfo?.firstPerson);

  const sceneActionsRef = useRef<SceneActions | null>(null);

  const searchHits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as NavSearchHit[];
    const hits: NavSearchHit[] = [];

    for (const r of walkRoutes) {
      if (!r.name.toLowerCase().includes(q)) continue;
      const mid = routeMidLatLon(r, activeLat, activeLon);
      hits.push({
        id: `street-${r.name}`,
        kind: "street",
        name: r.name,
        subtitle: r.kind === "bridge" ? "Bridge" : "Street",
        lat: mid.lat,
        lon: mid.lon,
      });
      if (hits.length >= 8) break;
    }

    for (const s of transitStops) {
      if (!s.name.toLowerCase().includes(q)) continue;
      hits.push({
        id: `stop-${s.id}`,
        kind: "stop",
        name: s.name,
        subtitle:
          s.kind === "bus_station"
            ? "Bus station"
            : s.kind === "ferry_terminal"
            ? "Ferry terminal"
            : "Bus stop",
        lat: s.lat,
        lon: s.lon,
      });
      if (hits.length >= 12) break;
    }

    for (const l of landmarks) {
      if (
        !(
          l.name.toLowerCase().includes(q) ||
          l.district.toLowerCase().includes(q) ||
          l.summary.toLowerCase().includes(q)
        )
      ) {
        continue;
      }
      hits.push({
        id: `lm-${l.id}`,
        kind: "landmark",
        name: l.name,
        subtitle: l.district,
        lat: l.lat,
        lon: l.lon,
      });
      if (hits.length >= 16) break;
    }

    return hits.slice(0, 10);
  }, [searchQuery, walkRoutes, transitStops, landmarks, activeLat, activeLon]);

  const filteredStates = useMemo(() => {
    const q = stateFilter.trim().toLowerCase();
    if (!q) return NIGERIA_STATES;
    return NIGERIA_STATES.filter(
      (s) =>
        s.state.toLowerCase().includes(q) ||
        s.capital.toLowerCase().includes(q) ||
        s.zone.toLowerCase().includes(q)
    );
  }, [stateFilter]);

  const filteredCampuses = useMemo(() => {
    const q = stateFilter.trim().toLowerCase();
    const list = NIGERIA_PLACES.filter((p) => p.has3DCampus && p.campusSlug);
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.shortName.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q)
    );
  }, [stateFilter]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    setOsmPois([]);
    setWalkRoutes([]);
    setTransitStops([]);
    setLoadProgress({
      label: `Loading ${activeTitle} (${activeSub}) OpenStreetMap voxels…`,
      pct: 12,
    });
    setSelectedLandmark(null);
    setControlMode("orbit");
    setRideInfo(null);
    setStreetInfo(null);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd8a878);
    scene.fog = new THREE.FogExp2(0xd8a878, 0.00024);

    // Lagos opens on a named view; every other city on its centre
    const preset = isLagos ? LAGOS_CAMERA_PRESETS[initialView || "overview"] || LAGOS_CAMERA_PRESETS.overview : null;
    const [startX, startZ] = preset
      ? latLonToWorldMeters(preset.lat, preset.lon, stateProfile.lat, stateProfile.lon)
      : [0, 0];
    const startOffset = preset?.offset ?? [-720, 520, 920];

    const camera = new THREE.PerspectiveCamera(48, 1, 2, 16000);
    camera.position.set(startX + startOffset[0], startOffset[1], startZ + startOffset[2]);

    const lite = isLiteDevice();
    const { renderer, unmount } = mountRenderer(container, camera);
    const applyRenderScale = () =>
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1.5 : 2) * renderScaleRef.current);
    applyRenderScale();
    renderer.shadowMap.enabled = true;
    // Soft shadows cost several extra samples per pixel
    renderer.shadowMap.type = lite ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(startX, 12, startZ);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = 28;
    controls.maxDistance = 4200;
    controls.update();

    const hemiLight = new THREE.HemisphereLight(0xffe7cc, 0x263240, 0.72);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffdfb4, 2.2);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.setScalar(lite ? 1024 : 2048);
    sunLight.shadow.camera.near = 100;
    sunLight.shadow.camera.far = 6500;
    const shadowBound = 2000;
    sunLight.shadow.camera.left = -shadowBound;
    sunLight.shadow.camera.right = shadowBound;
    sunLight.shadow.camera.top = shadowBound;
    sunLight.shadow.camera.bottom = -shadowBound;
    sunLight.shadow.bias = -0.0008;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // Base water / ground horizon plane
    const waterGeo = new THREE.PlaneGeometry(16000, 14000, 1, 1);
    const hasWaterBackdrop = stateProfile.waterType !== "none";
    const waterMat = new THREE.MeshStandardMaterial({
      color: hasWaterBackdrop ? 0x164258 : 0x282622,
      roughness: hasWaterBackdrop ? 0.28 : 0.92,
      metalness: hasWaterBackdrop ? 0.42 : 0.04,
    });
    const waterPlane = new THREE.Mesh(waterGeo, waterMat);
    waterPlane.rotation.x = -Math.PI / 2;
    waterPlane.position.y = 0.25;
    waterPlane.receiveShadow = true;
    scene.add(waterPlane);

    const nightUniform = { value: 0.0 };
    const voxelMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    voxelMat.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = nightUniform;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           attribute vec3 aGlow;
           varying vec3 vGlow;
           varying vec3 vWorldPos;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vGlow = aGlow;
           vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform float uNight;
           varying vec3 vGlow;
           varying vec3 vWorldPos;`
        )
        .replace(
          "#include <dithering_fragment>",
          `
           float fy = fract(vWorldPos.y / 3.0);
           float fxz = fract((vWorldPos.x + vWorldPos.z) / 3.0);
           if (vWorldPos.y > 2.2) {
             float slab = smoothstep(0.0, 0.14, fy);
             gl_FragColor.rgb *= mix(0.88, 1.0, slab);
             float winY = step(0.26, fy) * step(fy, 0.74);
             float winX = step(0.22, fxz) * step(fxz, 0.76);
             gl_FragColor.rgb += vGlow * winY * winX * uNight * 1.15;
           } else {
             gl_FragColor.rgb += vGlow * uNight * 1.1;
           }
           #include <dithering_fragment>`
        );
    };

    // Rain particle system
    const rainCount = lite ? 1500 : 3500;
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 1600;
      rainPos[i * 3 + 1] = Math.random() * 450;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 1600;
    }
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rainPoints = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({ color: 0xcbd5e1, size: 2.2, transparent: true, opacity: 0.55 })
    );
    rainPoints.visible = false;
    scene.add(rainPoints);

    if (isLagos) {
      const [pyX, pyZ] = latLonToWorldMeters(6.4437, 3.4455, stateProfile.lat, stateProfile.lon);
      const cablePts: number[] = [];
      for (const side of [-1, 1]) {
        for (let s = 1; s <= 6; s++) {
          cablePts.push(pyX, 66 - s * 4, pyZ + side * 4);
          cablePts.push(pyX + s * 32, 14, pyZ + side * 6);
          cablePts.push(pyX, 66 - s * 4, pyZ + side * 4);
          cablePts.push(pyX - s * 32, 14, pyZ + side * 6);
        }
      }
      const cableGeo = new THREE.BufferGeometry();
      cableGeo.setAttribute("position", new THREE.Float32BufferAttribute(cablePts, 3));
      scene.add(
        new THREE.LineSegments(
          cableGeo,
          new THREE.LineBasicMaterial({ color: 0xf1f5f9, transparent: true, opacity: 0.55 })
        )
      );
    }

    const cityGroup = new THREE.Group();
    scene.add(cityGroup);
    const trafficGroup = new THREE.Group();
    scene.add(trafficGroup);
    const pedGroup = new THREE.Group();
    scene.add(pedGroup);

    const vehicles: VehicleInstance[] = [];
    const pedestrians: PedestrianInstance[] = [];
    let activeRideIdx = 0;
    let activePedIdx = 0;
    let snapPedCam = false;

    let flyAnim: {
      active: boolean;
      startPos: THREE.Vector3;
      endPos: THREE.Vector3;
      startTarget: THREE.Vector3;
      endTarget: THREE.Vector3;
      t: number;
    } | null = null;

    const keysDown = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      keysDown.add(e.key.toLowerCase());
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    function setOrbitCameraConstraints(isStreet: boolean) {
      if (isStreet) {
        controls.enabled = true;
        controls.minDistance = 0.5;
        controls.maxDistance = 10;
        controls.minPolarAngle = Math.PI * 0.2;
        controls.maxPolarAngle = Math.PI * 0.64;
      } else {
        controls.enabled = true;
        controls.minDistance = 28;
        controls.maxDistance = 4200;
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = Math.PI * 0.485;
      }
    }

    /** Sidewalk point nearest to a spot, on the walkable streets if the city has them. */
    function findNearestStreetPoint(refX: number, refZ: number) {
      const routes =
        walkRoutesRef.current.length > 0
          ? walkRoutesRef.current
          : [...new Set(vehicles.filter((v) => v.kind !== "ferry").map((v) => v.route))];
      let bestDist = Infinity;
      const pos = new THREE.Vector3(refX, 3.6, refZ);
      const dir = new THREE.Vector3(0, 0, 1);
      let name = `${stateProfile.capital} Avenue`;
      for (const route of routes) {
        if (route.kind === "ferry") continue;
        const pts = route.pts;
        for (let i = 0; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) * 0.5;
          const my = (pts[i][1] + pts[i + 1][1]) * 0.5;
          const mz = (pts[i][2] + pts[i + 1][2]) * 0.5;
          const d = Math.hypot(mx - refX, mz - refZ);
          if (d >= bestDist) continue;
          bestDist = d;
          dir.set(pts[i + 1][0] - pts[i][0], 0, pts[i + 1][2] - pts[i][2]).normalize();
          // On the sidewalk, 3.6 m to the side of the road's centre line
          pos.set(mx - dir.z * 3.6, my + 0.6, mz + dir.x * 3.6);
          name = route.name;
        }
      }
      return { pos, dir, name };
    }

    const rideVehicle = (chosen: VehicleInstance) => {
      activeRideIdx = vehicles.indexOf(chosen) + 1;
      setControlMode("ride");
      setStreetInfo(null);
      setSelectedLandmark(null);
      setRideInfo({
        kind: vehicleLabel(chosen.kind, isLagos, stateProfile.capital),
        route: chosen.route.name,
        speedKmh: Math.round(chosen.speedMps * 3.6),
      });
      controls.enabled = false;
    };

    const followPedestrian = (ped: PedestrianInstance, firstPerson: boolean) => {
      activePedIdx = pedestrians.indexOf(ped) + 1;
      setControlMode("pedestrian");
      setRideInfo(null);
      setSelectedLandmark(null);
      setStreetInfo({ streetName: ped.route.name, personName: ped.label, firstPerson });
      controls.enabled = false;
    };

    sceneActionsRef.current = {
      flyToLatLon: (lat, lon, offset = [-340, 200, 390]) => {
        const [wx, wz] = latLonToWorldMeters(lat, lon, activeLat, activeLon);
        setControlMode("orbit");
        setRideInfo(null);
        setStreetInfo(null);
        setOrbitCameraConstraints(false);
        flyAnim = {
          active: true,
          startPos: camera.position.clone(),
          endPos: new THREE.Vector3(wx + offset[0], offset[1], wz + offset[2]),
          startTarget: controls.target.clone(),
          endTarget: new THREE.Vector3(wx, 18, wz),
          t: 0,
        };
      },
      cycleRide: (preferredKind) => {
        if (vehicles.length === 0) return;
        const limit = isLagos ? 3200 : 1500;
        const coreVehicles = vehicles.filter((v) => {
          const mid = v.route.pts[Math.floor(v.route.pts.length / 2)];
          return Math.abs(mid[0]) < limit && Math.abs(mid[2]) < limit;
        });
        const basePool = coreVehicles.length > 0 ? coreVehicles : vehicles;
        const pool = preferredKind ? basePool.filter((v) => v.kind === preferredKind) : basePool;
        const list = pool.length > 0 ? pool : basePool;
        rideVehicle(list[activeRideIdx % list.length]);
        if (isSmallScreen()) setControlsOpen(false);
      },
      enterStreetView: (lat, lon) => {
        let refX = controls.target.x;
        let refZ = controls.target.z;
        if (typeof lat === "number" && typeof lon === "number") {
          const [wx, wz] = latLonToWorldMeters(lat, lon, activeLat, activeLon);
          refX = wx;
          refZ = wz;
        }
        const snapped = findNearestStreetPoint(refX, refZ);
        setControlMode("street");
        setRideInfo(null);
        setStreetInfo({ streetName: snapped.name });
        if (isSmallScreen()) setControlsOpen(false);
        setOrbitCameraConstraints(true);
        flyAnim = null;

        camera.position.copy(snapped.pos);
        controls.target.set(
          snapped.pos.x + snapped.dir.x * 6,
          snapped.pos.y,
          snapped.pos.z + snapped.dir.z * 6
        );
        controls.update();
      },
      followNextPedestrian: () => {
        if (pedestrians.length === 0) return;
        snapPedCam = true;
        followPedestrian(pedestrians[activePedIdx % pedestrians.length], streetFpvRef.current);
        if (isSmallScreen()) setControlsOpen(false);
      },
      togglePedestrianFpv: () => {
        setStreetInfo((prev) =>
          prev ? { ...prev, firstPerson: !prev.firstPerson } : prev
        );
      },
      exitToFly: () => {
        setControlMode("orbit");
        setRideInfo(null);
        setStreetInfo(null);
        setOrbitCameraConstraints(false);
        const cur = controls.target.clone();
        camera.position.set(cur.x - 240, 190, cur.z + 280);
        controls.target.set(cur.x, 14, cur.z);
        controls.update();
      },
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownXY = [0, 0];
    const onPointerDown = (e: PointerEvent) => {
      pointerDownXY = [e.clientX, e.clientY];
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - pointerDownXY[0], e.clientY - pointerDownXY[1]) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      /** The pedestrian or vehicle whose mesh was hit, if any. */
      const hitActor = <T extends { mesh: THREE.Group }>(group: THREE.Group, actors: T[]): T | undefined => {
        let obj: THREE.Object3D | null = raycaster.intersectObjects(group.children, true)[0]?.object ?? null;
        while (obj && obj.parent !== group) obj = obj.parent;
        return actors.find((a) => a.mesh === obj);
      };
      // People are smaller than vehicles, so they win when both are under the pointer
      const ped = hitActor(pedGroup, pedestrians);
      if (ped) return followPedestrian(ped, false);
      const vehicle = hitActor(trafficGroup, vehicles);
      if (vehicle) rideVehicle(vehicle);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    let pendingChunks: { cx: number; cz: number; dist: number }[] = [];
    let gridData: ReturnType<typeof parseLagosBinary> | null = null;
    let paletteRgb: [number, number, number][] = [];
    let builtChunks = 0;
    let totalChunks = 0;
    let totalTris = 0;
    let totalBuildings = 0;

    async function loadCity() {
      try {
        const slug = isCampus && campusProfile?.campusSlug ? campusProfile.campusSlug : stateProfile.slug;
        const metaUrl = isLagos ? "/data/lagos-meta.json" : `/data/cities/${slug}-meta.json`;
        const binUrl = isLagos ? "/data/lagos-world.bin" : `/data/cities/${slug}.bin`;

        // Start the grid download now; it doesn't depend on the meta
        const binPromise = fetch(binUrl).then(readWorldBinary);
        binPromise.catch(() => {});
        setLoadProgress({ label: `Fetching ${activeTitle} road & transit routes…`, pct: 22 });
        const metaRes = await fetch(metaUrl);
        const meta: LagosMeta = await metaRes.json();
        if (disposed) return;

        if (Array.isArray(meta.pois) && meta.pois.length > 0) {
          setOsmPois(
            meta.pois.slice(0, 14).map((p) => ({
              id: `osm-poi-${p.id}`,
              name: p.name,
              district: `${activeTitle} · ${activeSub}`,
              lat: p.lat,
              lon: p.lon,
              elevationM: 28,
              importance: 2 as const,
              category:
                p.kind === "university" || p.kind === "college"
                  ? "university"
                  : "landmark",
              summary: `${p.name} — real OpenStreetMap campus/city feature inside ${activeTitle}.`,
              vibeNote: "Click Street View Here to walk past this building at ground level.",
              rentEstimate: p.kind,
              guideSlug: campusProfile?.guideSlug || "visiting-nigeria",
            }))
          );
        }

        const loadedWalk =
          Array.isArray(meta.walkRoutes) && meta.walkRoutes.length > 0
            ? meta.walkRoutes
            : (meta.routes || []).filter(
                (r) =>
                  r.kind !== "ferry" &&
                  r.name &&
                  !/^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)/i.test(
                    r.name
                  )
              );
        setWalkRoutes(loadedWalk);
        walkRoutesRef.current = loadedWalk;
        setTransitStops(Array.isArray(meta.stops) ? meta.stops : []);

        totalBuildings = meta.stats?.buildings || 0;
        setHudStats((prev) => ({ ...prev, buildingsCount: totalBuildings }));
        setLoadProgress({
          label: `Streaming ${activeTitle} (${totalBuildings.toLocaleString()} OSM buildings)…`,
          pct: 55,
        });
        const buf = await binPromise;
        if (disposed) return;

        gridData = parseLagosBinary(buf, meta);
        paletteRgb = buildPaletteRgb(meta.palette);

        const cols = Math.ceil(gridData.gridW / CHUNK_CELLS);
        const rows = Math.ceil(gridData.gridH / CHUNK_CELLS);
        totalChunks = cols * rows;

        const targetX = controls.target.x;
        const targetZ = controls.target.z;

        const queue: { cx: number; cz: number; dist: number }[] = [];
        for (let cz = 0; cz < rows; cz++) {
          for (let cx = 0; cx < cols; cx++) {
            const worldX = (cx + 0.5) * CHUNK_CELLS * gridData.cellM - gridData.halfWM;
            const worldZ = (cz + 0.5) * CHUNK_CELLS * gridData.cellM - gridData.halfHM;
            queue.push({ cx, cz, dist: Math.hypot(worldX - targetX, worldZ - targetZ) });
          }
        }
        queue.sort((a, b) => a.dist - b.dist);
        pendingChunks = queue;

        const routes = meta.routes || [];
        routes.forEach((route, rIdx) => {
          const { segLengths, totalLen } = routeLengths(route);
          if (totalLen < 50) return;

          // Spawn walking pedestrians on downtown city streets (inside voxel grid, non-ferry/non-highway-bridge)
          const midPt = route.pts[Math.floor(route.pts.length / 2)];
          const insideGrid =
            Math.abs(midPt[0]) < meta.halfWM - 280 &&
            Math.abs(midPt[2]) < meta.halfHM - 240;
          if (route.kind !== "ferry" && route.kind !== "bridge" && insideGrid && pedestrians.length < 110) {
            const pedCount = 3;
            for (let p = 0; p < pedCount; p++) {
              const seed = rIdx * 13 + p * 7;
              const built = buildPedestrianMesh(seed);
              pedGroup.add(built.group);
              // Pick an initial progress along a segment well inside the city grid
              let initProgress = ((p + 0.35) / pedCount) * totalLen * 0.8 + Math.random() * 35;
              let accLen = 0;
              for (let s = 0; s < segLengths.length; s++) {
                const pt = route.pts[s];
                if (
                  Math.abs(pt[0]) < meta.halfWM - 350 &&
                  Math.abs(pt[2]) < meta.halfHM - 300
                ) {
                  initProgress = accLen + segLengths[s] * (0.2 + p * 0.25);
                  break;
                }
                accLen += segLengths[s];
              }

              pedestrians.push({
                mesh: built.group,
                leftLeg: built.leftLeg,
                rightLeg: built.rightLeg,
                leftArm: built.leftArm,
                rightArm: built.rightArm,
                route,
                label: PEDESTRIAN_NAMES[seed % PEDESTRIAN_NAMES.length],
                progress: Math.min(totalLen - 1, initProgress),
                dirSign: (seed % 2 === 0 ? 1 : -1) as 1 | -1,
                sideOffset: seed % 2 === 0 ? 3.5 : -3.5,
                speedMps: 1.45 + (seed % 5) * 0.14,
                stridePhase: Math.random() * Math.PI * 2,
                segLengths,
                totalLen,
              });
            }
          }

          const count = route.kind === "ferry" ? 3 : route.kind === "bridge" ? 3 : 2;
          for (let k = 0; k < count; k++) {
            const kind: VehicleInstance["kind"] =
              route.kind === "ferry"
                ? "ferry"
                : (rIdx + k) % 5 === 0
                ? "brt"
                : (rIdx + k) % 2 === 0
                ? "danfo"
                : "car";
            const mesh = buildVehicleMesh(kind, isLagos);
            trafficGroup.add(mesh);
            vehicles.push({
              mesh,
              route,
              kind,
              progress: (k / count) * totalLen + Math.random() * 60,
              speedMps:
                kind === "ferry"
                  ? 11
                  : kind === "brt"
                  ? 18
                  : kind === "danfo"
                  ? 16 + Math.random() * 6
                  : 19 + Math.random() * 6,
              segLengths,
              totalLen,
            });
          }
        });

        setLoadProgress({ label: `Meshing ${stateProfile.capital} 3D voxels…`, pct: 80 });
      } catch (err) {
        console.error(`Failed loading ${stateProfile.slug} voxel world:`, err);
        setLoadProgress(null);
      }
    }

    loadCity();

    const vPos = new THREE.Vector3();
    const vDir = new THREE.Vector3();
    const projVec = new THREE.Vector3();
    const fwdVec = new THREE.Vector3();
    const rightVec = new THREE.Vector3();

    let lastTime = performance.now();
    let fpsAccum = 0;
    let fpsFrames = 0;
    let currentFps = 60;
    let lastRenderScale = renderScaleRef.current;

    // Scratch objects, so the loop below allocates nothing per frame
    const skyColor = new THREE.Color();
    const tint = new THREE.Color();
    const camGoal = new THREE.Vector3();
    const lookGoal = new THREE.Vector3();
    const move = new THREE.Vector3();

    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (Math.abs(renderScaleRef.current - lastRenderScale) > 0.01) {
        lastRenderScale = renderScaleRef.current;
        applyRenderScale();
      }

      if (gridData && pendingChunks.length > 0) {
        const startT = performance.now();
        while (pendingChunks.length > 0 && performance.now() - startT < 12) {
          const next = pendingChunks.shift()!;
          const geo = buildChunkGeometry(gridData, next.cx, next.cz, paletteRgb);
          builtChunks++;
          if (geo) {
            const mesh = new THREE.Mesh(geo, voxelMat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            cityGroup.add(mesh);
            totalTris += (geo.index ? geo.index.count : 0) / 3;
          }
        }
        if (pendingChunks.length === 0 || builtChunks > 36) {
          setLoadProgress(null);
        }
      }

      const h = hourRef.current;
      const day = dayRef.current;
      const wMode = weatherRef.current;

      const solarAngle = ((h - 6.3) / 12.2) * Math.PI;
      const sunSin = Math.sin(solarAngle);
      const sunCos = Math.cos(solarAngle);
      const sunAz = (day / 365 - 0.5) * 0.45;

      sunLight.position.set(
        controls.target.x + sunCos * 1800,
        Math.max(120, sunSin * 1900),
        controls.target.z + Math.sin(sunAz) * 900 + 450
      );
      sunLight.target.position.set(controls.target.x, 0, controls.target.z);

      const isDay = sunSin > 0;
      const goldenFactor = Math.max(0, 1 - Math.abs(sunSin) * 3.2);
      const nightFactor = THREE.MathUtils.clamp((-sunSin + 0.08) * 3.0, 0, 1);
      nightUniform.value = nightFactor;

      if (wMode === "harmattan") {
        skyColor.setRGB(
          isDay ? 0.78 - nightFactor * 0.65 : 0.07,
          isDay ? 0.63 - nightFactor * 0.52 : 0.06,
          isDay ? 0.46 - nightFactor * 0.36 : 0.07
        );
      } else if (wMode === "rain" || wMode === "cloudy") {
        const overcast = wMode === "rain" ? 0.36 : 0.56;
        skyColor.setRGB(
          overcast * (1 - nightFactor * 0.85),
          (overcast + 0.03) * (1 - nightFactor * 0.85),
          (overcast + 0.08) * (1 - nightFactor * 0.78)
        );
      } else {
        skyColor
          .setHex(wMode === "clear" ? 0x6ba7d9 : 0x89b7d6)
          .lerp(tint.setHex(0xd98b5f), goldenFactor * 0.75)
          .lerp(tint.setHex(0x090d16), nightFactor);
      }

      (scene.background as THREE.Color).copy(skyColor);
      (scene.fog as THREE.FogExp2).color.copy(skyColor);
      (scene.fog as THREE.FogExp2).density =
        wMode === "harmattan"
          ? 0.00052
          : wMode === "rain"
          ? 0.00044
          : wMode === "clear"
          ? 0.00014
          : 0.00023;

      sunLight.intensity =
        (wMode === "rain" ? 0.65 : wMode === "cloudy" ? 0.95 : wMode === "harmattan" ? 1.35 : 2.35) *
        Math.max(0.24, sunSin + 0.14) *
        (1 - nightFactor * 0.72);
      sunLight.color.setHex(0xfff1d6).lerp(tint.setHex(0xff9248), goldenFactor * 0.85);
      hemiLight.intensity = 0.44 + (1 - nightFactor) * 0.45;
      if (hasWaterBackdrop) {
        waterMat.color
          .setHex(wMode === "harmattan" ? 0x2b454e : 0x15465e)
          .lerp(tint.setHex(0x0b1c2d), nightFactor * 0.65);
      } else {
        waterMat.color.setHex(0x282622).lerp(tint.setHex(0x0f1014), nightFactor * 0.75);
      }

      rainPoints.visible = wMode === "rain";
      if (wMode === "rain") {
        rainPoints.position.set(controls.target.x, 0, controls.target.z);
        const arr = rainGeo.attributes.position.array as Float32Array;
        for (let i = 1; i < arr.length; i += 3) {
          arr[i] -= 260 * dt;
          if (arr[i] < 0) arr[i] = 440;
        }
        rainGeo.attributes.position.needsUpdate = true;
      }

      if (flyAnim && flyAnim.active) {
        flyAnim.t = Math.min(1, flyAnim.t + dt * 1.45);
        const ease = 1 - Math.pow(1 - flyAnim.t, 3);
        camera.position.lerpVectors(flyAnim.startPos, flyAnim.endPos, ease);
        controls.target.lerpVectors(flyAnim.startTarget, flyAnim.endTarget, ease);
        if (flyAnim.t >= 1) flyAnim.active = false;
      }

      for (const v of vehicles) {
        v.progress = (v.progress + v.speedMps * dt) % v.totalLen;
        sampleRoutePoint(v, v.progress, vPos, vDir);
        v.mesh.position.copy(vPos);
        if (vDir.lengthSq() > 0.001) {
          v.mesh.rotation.y = Math.atan2(vDir.x, vDir.z);
        }
      }

      // Animate walking pedestrians along sidewalks
      for (const ped of pedestrians) {
        ped.progress += ped.speedMps * ped.dirSign * dt;
        if (ped.progress >= ped.totalLen) {
          ped.progress = ped.totalLen;
          ped.dirSign = -1;
        } else if (ped.progress <= 0) {
          ped.progress = 0;
          ped.dirSign = 1;
        }
        sampleRoutePoint(ped, ped.progress, vPos, vDir);
        if (vDir.lengthSq() > 0.001) {
          // Clamp pedestrian inside grid bounds on multi-km arterials
          const inBound =
            gridData &&
            (Math.abs(vPos.x) > gridData.halfWM - 160 || Math.abs(vPos.z) > gridData.halfHM - 160);
          if (inBound) {
            ped.dirSign = (ped.dirSign === 1 ? -1 : 1) as 1 | -1;
            ped.progress = THREE.MathUtils.clamp(
              ped.progress + ped.speedMps * ped.dirSign * 2,
              0,
              ped.totalLen
            );
          }
          // Offset onto sidewalk perpendicular to road direction
          const perpX = -vDir.z * ped.sideOffset;
          const perpZ = vDir.x * ped.sideOffset;
          ped.mesh.position.set(vPos.x + perpX, vPos.y - 1.55, vPos.z + perpZ);
          const walkYaw = Math.atan2(vDir.x * ped.dirSign, vDir.z * ped.dirSign);
          ped.mesh.rotation.y = walkYaw;
        }
        ped.stridePhase += dt * ped.speedMps * 4.8;
        const swing = Math.sin(ped.stridePhase) * 0.55;
        ped.leftLeg.rotation.x = swing;
        ped.rightLeg.rotation.x = -swing;
        ped.leftArm.rotation.x = -swing * 0.75;
        ped.rightArm.rotation.x = swing * 0.75;
      }

      const mode = controlModeRef.current;
      if (mode === "ride" && vehicles.length > 0) {
        const targetV = vehicles[(activeRideIdx - 1 + vehicles.length) % vehicles.length];
        sampleRoutePoint(targetV, targetV.progress, vPos, vDir);
        camGoal.copy(vPos).addScaledVector(vDir, -28);
        camGoal.y += 11;
        camera.position.lerp(camGoal, 0.12);
        lookGoal.copy(vPos).addScaledVector(vDir, 42);
        lookGoal.y += 4;
        camera.lookAt(lookGoal);
      } else if (mode === "pedestrian" && pedestrians.length > 0) {
        const ped = pedestrians[(activePedIdx - 1 + pedestrians.length) % pedestrians.length];
        sampleRoutePoint(ped, ped.progress, vPos, vDir);
        const walkDir = vDir.multiplyScalar(ped.dirSign);
        const px = ped.mesh.position.x;
        const py = ped.mesh.position.y;
        const pz = ped.mesh.position.z;
        if (streetFpvRef.current) {
          // 1st-person eye-level view from the walking person's perspective
          const bob = Math.abs(Math.sin(ped.stridePhase)) * 0.12;
          camera.position.set(px + walkDir.x * 0.6, py + 2.35 + bob, pz + walkDir.z * 0.6);
          camera.lookAt(px + walkDir.x * 30, py + 2.25, pz + walkDir.z * 30);
        } else {
          // Over-the-shoulder street view following the walking person
          camGoal.set(px - walkDir.x * 8.0, py + 4.4, pz - walkDir.z * 8.0);
          if (snapPedCam) {
            camera.position.copy(camGoal);
            snapPedCam = false;
          } else {
            camera.position.lerp(camGoal, 0.16);
          }
          camera.lookAt(px + walkDir.x * 16, py + 2.2, pz + walkDir.z * 16);
        }
      } else {
        if (keysDown.size > 0) {
          const speed = (mode === "street" ? 16 : 260) * dt;
          camera.getWorldDirection(fwdVec);
          fwdVec.y = 0;
          fwdVec.normalize();
          rightVec.crossVectors(fwdVec, camera.up).normalize();

          move.set(0, 0, 0);
          if (keysDown.has("w") || keysDown.has("arrowup")) move.add(fwdVec);
          if (keysDown.has("s") || keysDown.has("arrowdown")) move.sub(fwdVec);
          if (keysDown.has("d") || keysDown.has("arrowright")) move.add(rightVec);
          if (keysDown.has("a") || keysDown.has("arrowleft")) move.sub(rightVec);
          if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(speed);
            if (mode === "street" && gridData) {
              // Prevent walking straight through voxel buildings
              const nextX = camera.position.x + move.x;
              const nextZ = camera.position.z + move.z;
              const gx = Math.floor((nextX + gridData.halfWM) / gridData.cellM);
              const gz = Math.floor((nextZ + gridData.halfHM) / gridData.cellM);
              const blocked =
                gx >= 0 &&
                gx < gridData.gridW &&
                gz >= 0 &&
                gz < gridData.gridH &&
                gridData.bHeight[gz * gridData.gridW + gx] > 0;
              if (!blocked) {
                camera.position.add(move);
                controls.target.add(move);
              }
            } else {
              camera.position.add(move);
              controls.target.add(move);
            }
          }
        }
        if (mode === "street") {
          const bob = keysDown.size > 0 ? Math.abs(Math.sin(now * 0.008)) * 0.14 : 0;
          camera.position.y = Math.max(3.5, Math.min(camera.position.y, 9.5));
          if (camera.position.y < 5) camera.position.y = 3.6 + bob;
        }
        controls.update();
      }

      renderer.render(scene, camera);

      const labelsEl = labelsLayerRef.current;
      if (labelsEl) {
        const cw = renderer.domElement.clientWidth;
        const ch = renderer.domElement.clientHeight;
        const children = labelsEl.children;
        const activeLandmarks = landmarkWorldRef.current;
        for (let i = 0; i < activeLandmarks.length; i++) {
          const el = children[i] as HTMLElement | undefined;
          if (!el) continue;
          const { lm, pos } = activeLandmarks[i];
          const dist = camera.position.distanceTo(pos);
          projVec.copy(pos).project(camera);

          const behind = projVec.z > 1 || projVec.z < -1;
          const offscreen =
            projVec.x < -1.05 || projVec.x > 1.05 || projVec.y < -1.05 || projVec.y > 1.05;
          const maxDist = lm.importance === 1 ? 6500 : lm.importance === 2 ? 3200 : 1800;

          if (behind || offscreen || dist > maxDist) {
            el.style.opacity = "0";
            el.style.pointerEvents = "none";
          } else {
            const sx = (projVec.x * 0.5 + 0.5) * cw;
            const sy = (-projVec.y * 0.5 + 0.5) * ch;
            el.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -100%)`;
            const fade = THREE.MathUtils.clamp(1 - (dist - maxDist * 0.65) / (maxDist * 0.35), 0.15, 1);
            el.style.opacity = String(fade);
            el.style.pointerEvents = "auto";
          }
        }
      }

      fpsAccum += dt;
      fpsFrames++;
      if (fpsAccum >= 0.6) {
        currentFps = Math.round(fpsFrames / fpsAccum);
        fpsAccum = 0;
        fpsFrames = 0;
        setHudStats({
          fps: currentFps,
          chunks: builtChunks,
          totalChunks,
          trisM: (totalTris / 1_000_000).toFixed(2),
          buildingsCount: totalBuildings,
        });
      }
    };

    const stop = renderLoop(container, animate, () => true);

    return () => {
      disposed = true;
      stop();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      disposeScene(scene);
      unmount();
    };
  }, [initialView, isLagos, isCampus, campusProfile, activeLat, activeLon, activeTitle, activeSub, stateProfile]);

  const handleSelectLandmark = (lm: UnifiedLandmark) => {
    setSelectedLandmark(lm);
    setSearchQuery("");
    sceneActionsRef.current?.flyToLatLon(lm.lat, lm.lon, [-300, 175, 360]);
  };

  const handleSelectNavHit = (hit: NavSearchHit) => {
    setSearchQuery("");
    if (hit.kind === "landmark") {
      const lm = landmarks.find((l) => l.id === hit.id.replace(/^lm-/, "") || l.name === hit.name);
      if (lm) {
        handleSelectLandmark(lm);
        return;
      }
    }
    setSelectedLandmark(null);
    // Drop onto the street / bus stop and enter sidewalk view
    sceneActionsRef.current?.enterStreetView(hit.lat, hit.lon);
  };

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#09090b] select-none touch-none">
      <div ref={containerRef} className="h-full w-full" />

      {/* Floating Landmark Labels */}
      <div ref={labelsLayerRef} className="pointer-events-none absolute inset-0 overflow-hidden">
        {landmarks.map((lm) => (
          <button
            key={lm.id}
            onClick={() => handleSelectLandmark(lm)}
            className="absolute left-0 top-0 flex items-center gap-1.5 rounded-full border border-white/25 bg-[#09090b]/75 px-2.5 py-1 text-[11px] font-medium text-[#f5f4f0] shadow-lg backdrop-blur-md transition-colors hover:border-[#f59e0b] hover:bg-[#18181b]"
            style={{ opacity: 0 }}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${LANDMARK_DOT[lm.category]}`} />
            <span>{lm.name}</span>
          </button>
        ))}
      </div>

      {/* Loading Progress */}
      {loadProgress && (
        <div className="pointer-events-none absolute left-4 top-4 z-30 rounded-lg border border-white/15 bg-[#09090b]/85 px-3.5 py-2.5 backdrop-blur-md">
          <div className="flex items-center justify-between gap-6 font-mono-tech text-[11px] text-[#f5f4f0]">
            <span>{loadProgress.label}</span>
            <span className="text-[#f59e0b]">{loadProgress.pct}%</span>
          </div>
          <div className="mt-1.5 h-1 w-64 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-[#00a862] transition-all duration-300"
              style={{ width: `${loadProgress.pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Pure 3D "Show HUD" pill when everything is minimized */}
      {hudHidden && !loadProgress && (
        <button
          onClick={() => setHudHidden(false)}
          className="absolute right-3 top-3 z-30 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-[#09090b]/85 px-3 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur-md hover:border-[#00a862]"
        >
          <Maximize2 className="h-3.5 w-3.5 text-[#00a862]" />
          Show HUD
        </button>
      )}

      {/* TOP HUD CONTAINER (flex row so left & right never overlap on phones) */}
      {!hudHidden && !loadProgress && (
        <div className="pointer-events-none absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex items-start justify-between gap-2">
          {/* Top-Left: State Switcher + Minimizable Search & Drawers */}
          <div className="pointer-events-auto flex min-w-0 max-w-[calc(100%-8.5rem)] flex-col gap-1.5 sm:w-80 sm:max-w-sm">
            {/* State & Capital Switcher + Minimize Toggle */}
            <div className="relative flex items-center gap-1">
              <button
                onClick={() => setStateSwitcherOpen((v) => !v)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-white/20 bg-[#09090b]/88 px-2.5 py-2 text-left shadow-xl backdrop-blur-md transition hover:border-[#00a862]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {isCampus ? (
                    <GraduationCap className="h-4 w-4 shrink-0 text-[#a855f7]" />
                  ) : (
                    <MapPin className="h-4 w-4 shrink-0 text-[#00a862]" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-white">
                      {activeTitle}{" "}
                      <span className="hidden font-normal text-[#9a9891] sm:inline">
                        · {activeSub}
                      </span>
                    </div>
                    <div className="truncate font-mono-tech text-[10px] text-[#10b981]">
                      {hudStats.buildingsCount.toLocaleString()} OSM
                      <span className="hidden sm:inline"> buildings · {stateProfile.zone}</span>
                    </div>
                  </div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#9a9891]" />
              </button>

              <button
                onClick={() => {
                  setTopPanelOpen((v) => !v);
                  setStateSwitcherOpen(false);
                  setPlacesDrawerOpen(false);
                }}
                title={topPanelOpen ? "Minimize search & presets" : "Expand search & presets"}
                aria-label={topPanelOpen ? "Minimize search panel" : "Expand search panel"}
                className="flex h-10 w-9 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-[#09090b]/88 text-[#d4d4d8] shadow-xl backdrop-blur-md hover:border-[#00a862] hover:text-white"
              >
                {topPanelOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
              </button>

              {stateSwitcherOpen && (
                <div className="absolute left-0 right-0 top-full z-40 mt-1.5 min-w-[260px] rounded-xl border border-white/15 bg-[#0d0d12]/98 p-2 shadow-2xl backdrop-blur-xl">
                  <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                    <button
                      onClick={() => setSwitcherTab("states")}
                      className={`rounded-md py-1 text-[11px] font-medium ${
                        switcherTab === "states"
                          ? "bg-[#00a862] text-[#0b1620]"
                          : "text-[#9a9891] hover:text-white"
                      }`}
                    >
                      States &amp; FCT (37)
                    </button>
                    <button
                      onClick={() => setSwitcherTab("universities")}
                      className={`rounded-md py-1 text-[11px] font-medium ${
                        switcherTab === "universities"
                          ? "bg-[#a855f7] text-white"
                          : "text-[#9a9891] hover:text-white"
                      }`}
                    >
                      Universities (16)
                    </button>
                  </div>
                  <input
                    type="text"
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value)}
                    placeholder={
                      switcherTab === "states"
                        ? "Jump to any of Nigeria's 36 states + FCT…"
                        : "Search UNILAG, UI, ABU, OAU, UNN, BUK…"
                    }
                    className="mb-2 w-full rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 text-xs text-white placeholder-[#71717a] focus:border-[#00a862] focus:outline-none"
                  />
                  <div className="max-h-60 overflow-y-auto pr-1">
                    {switcherTab === "states"
                      ? filteredStates.map((st) => (
                          <button
                            key={st.slug}
                            onClick={() => {
                              setStateSwitcherOpen(false);
                              setStateFilter("");
                              router.push(st.slug === "lagos" ? "/lagos" : `/explore/${st.slug}`);
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                              !isCampus && st.slug === stateProfile.slug
                                ? "bg-[#00a862]/25 text-white"
                                : "text-[#d4d4d8] hover:bg-white/10"
                            }`}
                          >
                            <div>
                              <span className="font-medium">{st.capital}</span>
                              <span className="ml-1.5 text-[11px] text-[#9a9891]">{st.state}</span>
                            </div>
                            <span className="font-mono-tech text-[10px] text-[#71717a]">
                              {st.zone}
                            </span>
                          </button>
                        ))
                      : filteredCampuses.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setStateSwitcherOpen(false);
                              setStateFilter("");
                              router.push(`/explore/${c.campusSlug}`);
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                              campusProfile?.campusSlug === c.campusSlug
                                ? "bg-[#a855f7]/25 text-white"
                                : "text-[#d4d4d8] hover:bg-white/10"
                            }`}
                          >
                            <div>
                              <span className="font-medium">{c.shortName}</span>
                              <span className="ml-1.5 text-[11px] text-[#9a9891]">{c.city}</span>
                            </div>
                            <span className="font-mono-tech text-[10px] text-[#a855f7]">
                              3D Campus
                            </span>
                          </button>
                        ))}
                  </div>
                </div>
              )}
            </div>

            {topPanelOpen && (
              <>
                {/* Streets, bus stops, landmarks — from OSM walk graph + editorial pins */}
                <div className="relative">
                  <div className="flex items-center rounded-xl border border-white/15 bg-[#09090b]/85 px-3 py-2 shadow-xl backdrop-blur-md">
                    <Search className="mr-2 h-4 w-4 shrink-0 text-[#9a9891]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={`Search streets, bus stops in ${activeTitle.split(" ")[0]}…`}
                      className="w-full bg-transparent text-xs text-[#f5f4f0] placeholder-[#71717a] focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="text-[#9a9891] hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {searchHits.length > 0 && (
                    <div className="mt-1.5 overflow-hidden rounded-xl border border-white/15 bg-[#0d0d11]/95 shadow-2xl backdrop-blur-md">
                      {searchHits.map((hit) => (
                        <button
                          key={hit.id}
                          onClick={() => handleSelectNavHit(hit)}
                          className="flex w-full items-center justify-between border-b border-white/5 px-3 py-2 text-left text-xs transition last:border-none hover:bg-white/10"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-white">{hit.name}</div>
                            <div className="text-[10px] text-[#9a9891]">{hit.subtitle}</div>
                          </div>
                          <span className="ml-2 flex shrink-0 items-center gap-1 font-mono-tech text-[10px] uppercase text-[#00a862]">
                            {hit.kind === "street" ? (
                              <Footprints className="h-3 w-3" />
                            ) : hit.kind === "stop" ? (
                              <Bus className="h-3 w-3" />
                            ) : (
                              <MapPin className="h-3 w-3" />
                            )}
                            {hit.kind === "street"
                              ? "Walk"
                              : hit.kind === "stop"
                              ? "Stop"
                              : "Pin"}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* State Universities & Landmarks Drawer */}
                {statePlaces.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setPlacesDrawerOpen((v) => !v)}
                      className="flex w-full items-center justify-between rounded-xl border border-[#a855f7]/35 bg-[#120e1a]/88 px-3 py-1.5 text-left text-[11px] font-medium text-[#e9d5ff] backdrop-blur-md transition hover:border-[#a855f7]"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <GraduationCap className="h-3.5 w-3.5 shrink-0 text-[#a855f7]" />
                        <span className="truncate">
                          Universities &amp; Landmarks ({statePlaces.length})
                        </span>
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    </button>

                    {placesDrawerOpen && (
                      <div className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-white/15 bg-[#0d0d12]/96 p-2 shadow-2xl backdrop-blur-xl">
                        {statePlaces.map((pl: NigeriaPlace) => {
                          const inScene = landmarks.some(
                            (l) => l.name === pl.shortName || l.name === pl.name
                          );
                          return (
                            <div
                              key={pl.id}
                              className="flex items-center justify-between gap-2 border-b border-white/5 py-2 last:border-none"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-xs font-medium text-white">
                                  {pl.shortName}
                                </div>
                                <div className="truncate font-mono-tech text-[10px] text-[#9a9891]">
                                  {pl.category.toUpperCase()} · {pl.city}
                                </div>
                              </div>
                              {pl.has3DCampus && pl.campusSlug ? (
                                <Link
                                  href={`/explore/${pl.campusSlug}`}
                                  onClick={() => setPlacesDrawerOpen(false)}
                                  className="shrink-0 rounded-md bg-[#a855f7]/25 px-2 py-1 font-mono-tech text-[10px] font-semibold text-[#e9d5ff] hover:bg-[#a855f7] hover:text-white"
                                >
                                  3D Campus →
                                </Link>
                              ) : inScene ? (
                                <button
                                  onClick={() => {
                                    setPlacesDrawerOpen(false);
                                    sceneActionsRef.current?.flyToLatLon(pl.lat, pl.lon, [-240, 140, 280]);
                                  }}
                                  className="shrink-0 rounded-md bg-[#10b981]/20 px-2 py-1 font-mono-tech text-[10px] font-semibold text-[#10b981] hover:bg-[#10b981] hover:text-[#09090b]"
                                >
                                  Fly Here →
                                </button>
                              ) : (
                                <Link
                                  href="/places"
                                  className="shrink-0 rounded-md border border-white/15 px-2 py-1 font-mono-tech text-[10px] text-[#b6b4ad] hover:text-white"
                                >
                                  Details
                                </Link>
                              )}
                            </div>
                          );
                        })}
                        {isCampus && (
                          <Link
                            href={stateProfile.slug === "lagos" ? "/lagos" : `/explore/${stateProfile.slug}`}
                            className="mt-2 block rounded-lg border border-white/15 bg-white/5 py-1.5 text-center font-mono-tech text-[10px] text-white hover:bg-white/10"
                          >
                            ← Back to {stateProfile.capital} City View
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Quick Camera Presets (desktop) */}
                <div className="hidden flex-wrap gap-1.5 sm:flex">
                  {isLagos
                    ? Object.entries(LAGOS_CAMERA_PRESETS).map(([key, p]) => (
                        <button
                          key={key}
                          onClick={() => {
                            setSelectedLandmark(null);
                            sceneActionsRef.current?.flyToLatLon(p.lat, p.lon, p.offset);
                          }}
                          className="rounded-lg border border-white/15 bg-[#09090b]/75 px-2.5 py-1 text-[11px] font-medium text-[#d4d4d8] backdrop-blur-md transition hover:border-[#00a862] hover:text-white"
                        >
                          {p.label}
                        </button>
                      ))
                    : landmarks.slice(0, 6).map((lm) => (
                        <button
                          key={lm.id}
                          onClick={() => handleSelectLandmark(lm)}
                          className="rounded-lg border border-white/15 bg-[#09090b]/75 px-2.5 py-1 text-[11px] font-medium text-[#d4d4d8] backdrop-blur-md transition hover:border-[#00a862] hover:text-white"
                        >
                          {lm.name}
                        </button>
                      ))}
                </div>
              </>
            )}
          </div>

          {/* Top-Right: Compact Minimizable Telemetry & Quick Actions */}
          <div className="pointer-events-auto flex shrink-0 flex-col items-end gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setTelemetryOpen((v) => !v)}
                title={telemetryOpen ? "Minimize stats" : "Expand stats & render quality"}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#09090b]/85 px-2.5 py-2 font-mono-tech text-[11px] text-[#d4d4d8] backdrop-blur-md hover:border-white/30"
              >
                <span className="text-[#10b981]">{hudStats.fps} fps</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-[#9a9891] transition-transform ${
                    telemetryOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              <button
                onClick={() =>
                  openFeedbackModal({
                    topic: `${stateProfile.capital} (${stateProfile.state})`,
                    category: "map-landmark",
                  })
                }
                title="Report Map Issue"
                aria-label="Report Map Issue"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-[#09090b]/85 px-2.5 text-[11px] font-medium text-[#f5f4f0] backdrop-blur-md hover:border-[#00a862]"
              >
                <Flag className="h-3.5 w-3.5 text-[#00a862]" />
                <span className="hidden sm:inline">Report</span>
              </button>

              <button
                onClick={() => setHudHidden(true)}
                title="Hide all HUD controls for fullscreen 3D"
                aria-label="Minimize all HUD controls"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-[#09090b]/85 text-[#d4d4d8] backdrop-blur-md hover:border-white/35 hover:text-white"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {telemetryOpen && (
              <div className="rounded-xl border border-white/15 bg-[#09090b]/85 px-3 py-2 text-right font-mono-tech text-[11px] text-[#d4d4d8] shadow-xl backdrop-blur-md">
                <div className="flex items-center justify-end gap-2">
                  <span>{hudStats.trisM}M tris</span>
                  <span className="text-white/25">·</span>
                  <span>
                    {hudStats.chunks}/{hudStats.totalChunks || (isLagos ? 600 : 140)} tiles
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-end gap-2">
                  <span className="text-[10px] text-[#9a9891]">Render size</span>
                  <input
                    type="range"
                    min={0.5}
                    max={1.25}
                    step={0.05}
                    value={renderScale}
                    onChange={(e) => setRenderScale(parseFloat(e.target.value))}
                    className="h-1 w-20 accent-[#00a862]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BOTTOM HUD CONTAINER (responsive flex so Atmosphere, Active Ride/Street, and Landmark Card never overlap!) */}
      {!hudHidden && (
        <div className="pointer-events-none absolute inset-x-3 z-20 flex flex-col gap-2 max-md:bottom-[calc(0.65rem+env(safe-area-inset-bottom,0px)+3.5rem)] md:inset-x-3 md:bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:flex-row md:items-end md:justify-between">
          {/* Bottom-Left: Camera & Minimizable Atmosphere Controls */}
          <div className="pointer-events-auto order-2 w-full max-w-sm md:order-1">
            {controlsOpen ? (
              <div className="rounded-2xl border border-white/15 bg-[#09090b]/88 p-3.5 shadow-2xl backdrop-blur-md">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="font-mono-tech text-[10px] uppercase tracking-wider text-[#9a9891]">
                    Camera &amp; Atmosphere
                  </span>
                  <button
                    onClick={() => setControlsOpen(false)}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-[#d4d4d8] hover:border-white/25 hover:text-white"
                  >
                    <ChevronDown className="h-3 w-3" />
                    Minimize
                  </button>
                </div>

                <div className="mb-3 grid grid-cols-4 gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
                  <ModeButtons
                    mode={controlMode}
                    onFerry={rideInfo?.kind === "River Ferry"}
                    rideName={isLagos ? "Danfo" : "Ride"}
                    actions={sceneActionsRef}
                    className="rounded-md"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tech text-[10px] uppercase tracking-wider text-[#9a9891]">
                      Sky follows device clock
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = nigeriaClockParts();
                        setHour(next.hour);
                        setDayOfYear(next.dayOfYear);
                        setLiveClock(true);
                      }}
                      className={`rounded-md border px-2 py-0.5 font-mono-tech text-[10px] uppercase tracking-wider transition ${
                        liveClock
                          ? "border-[#10b981]/50 bg-[#10b981]/20 text-[#6ee7b7]"
                          : "border-white/15 bg-white/5 text-[#d4d4d8] hover:border-white/30"
                      }`}
                    >
                      {liveClock ? "Live · WAT" : "Use live time"}
                    </button>
                  </div>
                  <div>
                    <div className="flex justify-between font-mono-tech text-[11px]">
                      <span className="text-[#9a9891]">Season / Date</span>
                      <span className="text-[#f5f4f0]">{formatDayOfYear(dayOfYear)}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={365}
                      value={dayOfYear}
                      onChange={(e) => {
                        setLiveClock(false);
                        setDayOfYear(Number(e.target.value));
                      }}
                      className="mt-1 h-1.5 w-full accent-[#10b981]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between font-mono-tech text-[11px]">
                      <span className="text-[#9a9891]">Nigeria WAT Time</span>
                      <span className="text-[#f59e0b]">{formatHour(hour)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={23.9}
                      step={0.05}
                      value={hour}
                      onChange={(e) => {
                        setLiveClock(false);
                        setHour(Number(e.target.value));
                      }}
                      className="mt-1 h-1.5 w-full accent-[#00a862]"
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: "typical", label: "typical", icon: Sparkles },
                      { id: "clear", label: "clear", icon: Sun },
                      { id: "harmattan", label: "harmattan", icon: Wind },
                      { id: "cloudy", label: "cloudy", icon: Cloud },
                      { id: "rain", label: "rain", icon: CloudRain },
                    ] as const
                  ).map((w) => {
                    const Icon = w.icon;
                    return (
                      <button
                        key={w.id}
                        onClick={() => setWeather(w.id)}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition ${
                          weather === w.id
                            ? "border-[#00a862] bg-[#00a862]/20 text-white"
                            : "border-white/10 bg-white/[0.03] text-[#9a9891] hover:text-white"
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {w.label}
                      </button>
                    );
                  })}
                </div>

                <p className="mt-2.5 hidden font-mono-tech text-[10px] text-[#71717a] sm:block">
                  Drag to look/orbit · WASD to walk · Click any walking person or vehicle
                </p>
              </div>
            ) : (
              /* Minimized compact bottom dock */
              <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-[#09090b]/88 p-1 shadow-xl backdrop-blur-md">
                <ModeButtons
                  mode={controlMode}
                  onFerry={rideInfo?.kind === "River Ferry"}
                  rideName={isLagos ? "Danfo" : "Ride"}
                  actions={sceneActionsRef}
                  className="flex-1 rounded-lg"
                />
                <button
                  onClick={() => setControlsOpen(true)}
                  title="Expand Time & Weather"
                  aria-label="Expand Time & Weather"
                  className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-[#f59e0b] hover:bg-white/10"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  <ChevronUp className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {/* Center: Active Street View / Pedestrian / Ride Status Bar (stacks cleanly above dock on mobile) */}
          <div className="pointer-events-auto order-1 flex flex-col items-stretch gap-2 md:order-2 md:items-center">
            {(controlMode === "street" || controlMode === "pedestrian") && streetInfo && (
              <div className="rounded-xl border border-[#10b981]/50 bg-[#09090b]/92 px-3.5 py-2.5 shadow-2xl backdrop-blur-md">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="font-mono-tech text-[10px] uppercase tracking-wider text-[#10b981]">
                      {controlMode === "pedestrian"
                        ? `Walking with ${streetInfo.personName}`
                        : "Street View · Sidewalk"}
                    </div>
                    <div className="truncate text-xs font-medium text-white">
                      {streetInfo.streetName}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => sceneActionsRef.current?.followNextPedestrian()}
                      className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/20"
                    >
                      {controlMode === "pedestrian" ? "Next Person" : "Walk with Person"}
                    </button>
                    {controlMode === "pedestrian" && (
                      <button
                        onClick={() => sceneActionsRef.current?.togglePedestrianFpv()}
                        className="rounded-lg border border-[#10b981]/40 bg-[#10b981]/15 px-2.5 py-1 text-[11px] font-medium text-[#10b981] hover:bg-[#10b981]/25"
                      >
                        {streetInfo.firstPerson ? "3rd Person" : "1st Person"}
                      </button>
                    )}
                    <button
                      onClick={() => sceneActionsRef.current?.exitToFly()}
                      className="rounded-lg bg-[#00a862] px-2.5 py-1 text-[11px] font-medium text-[#0b1620]"
                    >
                      City View
                    </button>
                  </div>
                </div>
              </div>
            )}

            {controlMode === "ride" && rideInfo && (
              <div className="rounded-xl border border-[#f59e0b]/40 bg-[#09090b]/92 px-3.5 py-2.5 shadow-2xl backdrop-blur-md">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono-tech text-[10px] uppercase tracking-wider text-[#f59e0b]">
                      Onboard · {rideInfo.kind} · {rideInfo.speedKmh} km/h
                    </div>
                    <div className="truncate text-xs font-medium text-white">{rideInfo.route}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => sceneActionsRef.current?.cycleRide()}
                      className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/20"
                    >
                      Next Vehicle
                    </button>
                    <button
                      onClick={() => sceneActionsRef.current?.exitToFly()}
                      className="rounded-lg bg-[#00a862] px-2.5 py-1 text-[11px] font-medium text-[#0b1620]"
                    >
                      Exit
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom-Right: Selected Landmark Card or Attribution */}
          <div className="pointer-events-auto order-3 w-full md:w-auto md:max-w-sm">
            {selectedLandmark ? (
              <div className="rounded-2xl border border-white/15 bg-[#0e0e12]/95 p-4 shadow-2xl backdrop-blur-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono-tech text-[10px] uppercase tracking-wider text-[#00a862]">
                      {selectedLandmark.district} · {selectedLandmark.category}
                    </span>
                    <h3 className="font-display mt-0.5 text-lg font-semibold text-white">
                      {selectedLandmark.name}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedLandmark(null)}
                    className="rounded-lg p-1 text-[#9a9891] hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-[#d4d4d8]">
                  {selectedLandmark.summary}
                </p>

                <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-[11px] text-[#b6b4ad]">
                  <div className="font-semibold text-[#10b981]">Local Vibe &amp; Strategy</div>
                  <p className="mt-0.5">{selectedLandmark.vibeNote}</p>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                  <button
                    onClick={() =>
                      sceneActionsRef.current?.enterStreetView(
                        selectedLandmark.lat,
                        selectedLandmark.lon
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#10b981]/40 bg-[#10b981]/15 px-3 py-1.5 text-xs font-semibold text-[#10b981] hover:bg-[#10b981] hover:text-[#09090b]"
                  >
                    <Footprints className="h-3.5 w-3.5" />
                    Street View Here
                  </button>
                  {selectedLandmark.campusSlug && (
                    <Link
                      href={`/explore/${selectedLandmark.campusSlug}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#a855f7] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9333ea]"
                    >
                      <GraduationCap className="h-3.5 w-3.5" />
                      3D Campus
                    </Link>
                  )}
                  <Link
                    href={`/guides/${selectedLandmark.guideSlug}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#f5f4f0] px-3 py-1.5 text-xs font-semibold text-[#09090b] hover:bg-white"
                  >
                    Read Guide
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="pointer-events-none hidden items-center gap-2 rounded-lg border border-white/10 bg-[#09090b]/70 px-2.5 py-1 font-mono-tech text-[10px] text-[#9a9891] backdrop-blur-sm lg:flex">
                <Compass className="h-3 w-3 text-[#00a862]" />
                <span>
                  {activeTitle} 3D Voxels · {hudStats.buildingsCount.toLocaleString()} real © OpenStreetMap buildings
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
