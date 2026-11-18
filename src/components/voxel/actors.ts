import * as THREE from "three";
import type { RouteLine } from "@/lib/lagos-voxel-mesher";

/** The vehicles and pedestrians that move through a voxel city. */

export type VehicleKind = "danfo" | "brt" | "car" | "ferry";

export interface VehicleInstance {
  mesh: THREE.Group;
  route: RouteLine;
  kind: VehicleKind;
  progress: number;
  speedMps: number;
  segLengths: number[];
  totalLen: number;
}

export interface PedestrianInstance {
  mesh: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  route: RouteLine;
  label: string;
  progress: number;
  dirSign: 1 | -1;
  sideOffset: number;
  speedMps: number;
  stridePhase: number;
  segLengths: number[];
  totalLen: number;
}

/** Length of each segment of a route, and their sum, in metres on the ground plane. */
export function routeLengths(route: RouteLine): { segLengths: number[]; totalLen: number } {
  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < route.pts.length - 1; i++) {
    const len = Math.hypot(route.pts[i + 1][0] - route.pts[i][0], route.pts[i + 1][2] - route.pts[i][2]);
    segLengths.push(len);
    totalLen += len;
  }
  return { segLengths, totalLen };
}

/** What the ride HUD calls a vehicle. */
export function vehicleLabel(kind: VehicleKind, isLagos: boolean, capital: string): string {
  if (kind === "danfo") return isLagos ? "Yellow Danfo" : `${capital} Transit`;
  if (kind === "brt") return "Metro BRT";
  if (kind === "ferry") return "River Ferry";
  return "City Car";
}

export function buildVehicleMesh(kind: VehicleKind, isLagos: boolean): THREE.Group {
  const g = new THREE.Group();
  if (kind === "danfo") {
    // Lagos = Yellow Danfo; Abuja/Other states = Green/White Metro Bus or Yellow Keke/Taxi
    const bodyColor = isLagos ? 0xf5b800 : 0x10b981;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 2.4, 5.4),
      new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    body.position.y = 1.4;
    g.add(body);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.66, 0.45, 5.44),
      new THREE.MeshLambertMaterial({ color: isLagos ? 0x18181b : 0xf8fafc })
    );
    stripe.position.y = 1.25;
    g.add(stripe);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.9, 3.8),
      new THREE.MeshLambertMaterial({ color: 0x1f2937 })
    );
    cabin.position.set(0, 2.1, -0.2);
    g.add(cabin);
  } else if (kind === "brt") {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 3.1, 10.5),
      new THREE.MeshLambertMaterial({ color: 0x1d70b8 })
    );
    body.position.y = 1.8;
    g.add(body);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.35, 9.6),
      new THREE.MeshLambertMaterial({ color: 0xe5e7eb })
    );
    roof.position.y = 3.5;
    g.add(roof);
  } else if (kind === "ferry") {
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 1.4, 14.0),
      new THREE.MeshLambertMaterial({ color: 0xf8fafc })
    );
    hull.position.y = 0.7;
    g.add(hull);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 1.9, 9.2),
      new THREE.MeshLambertMaterial({ color: 0x0284c7 })
    );
    cabin.position.set(0, 2.2, -0.5);
    g.add(cabin);
  } else {
    const colors = [0xe4e4e7, 0xdc2626, 0x334155, 0x10b981, 0xf8fafc];
    const col = colors[Math.floor(Math.random() * colors.length)];
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 1.4, 4.4),
      new THREE.MeshLambertMaterial({ color: col })
    );
    body.position.y = 0.9;
    g.add(body);
  }

  const lights = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.35, 0.25),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  lights.position.set(0, 1.0, kind === "brt" ? 5.3 : kind === "ferry" ? 7.0 : 2.75);
  g.add(lights);

  return g;
}

export const PEDESTRIAN_NAMES = [
  "Amina",
  "Chinedu",
  "Tunde",
  "Zainab",
  "Kelechi",
  "Sadiq",
  "Bisi",
  "Efe",
  "Ngozi",
  "Ibrahim",
  "Damilola",
  "Chukwuma",
  "Halima",
  "Uche",
  "Femi",
  "Musa",
];

export function buildPedestrianMesh(seed: number): {
  group: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
} {
  const group = new THREE.Group();
  const skinTones = [0x6d4730, 0x553421, 0x82573c, 0x452819];
  const shirtColors = [
    0xf4f4f5, // crisp white kaftan/shirt
    0xd96b27, // warm terracotta
    0x10b981, // emerald green
    0x2563eb, // indigo / adire blue
    0xeab308, // ochre gold
    0xec4899, // magenta
    0x0ea5e9, // sky blue
    0x334155, // slate
  ];
  const pantColors = [0x18181b, 0x1e293b, 0x3f3f46, 0x451a03, 0x27272a];

  const skinMat = new THREE.MeshLambertMaterial({
    color: skinTones[seed % skinTones.length],
  });
  const shirtMat = new THREE.MeshLambertMaterial({
    color: shirtColors[(seed * 3) % shirtColors.length],
  });
  const pantMat = new THREE.MeshLambertMaterial({
    color: pantColors[(seed * 7) % pantColors.length],
  });

  // Legs (pivot at hip y = 0.85)
  const legGeo = new THREE.BoxGeometry(0.26, 0.82, 0.28);
  legGeo.translate(0, -0.41, 0);
  const leftLeg = new THREE.Mesh(legGeo, pantMat);
  leftLeg.position.set(-0.17, 0.85, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, pantMat);
  rightLeg.position.set(0.17, 0.85, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.88, 0.38), shirtMat);
  torso.position.set(0, 1.3, 0);
  torso.castShadow = true;
  group.add(torso);

  // Arms (pivot at shoulder y = 1.68)
  const armGeo = new THREE.BoxGeometry(0.22, 0.74, 0.24);
  armGeo.translate(0, -0.35, 0);
  const leftArm = new THREE.Mesh(armGeo, shirtMat);
  leftArm.position.set(-0.46, 1.68, 0);
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, shirtMat);
  rightArm.position.set(0.46, 1.68, 0);
  group.add(rightArm);

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
  head.position.set(0, 2.02, 0);
  head.castShadow = true;
  group.add(head);

  // Optional cap / headwrap on some pedestrians
  if (seed % 3 === 0) {
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.18, 0.54),
      new THREE.MeshLambertMaterial({ color: shirtColors[(seed + 2) % shirtColors.length] })
    );
    cap.position.set(0, 2.3, 0);
    group.add(cap);
  }

  // Slightly larger invisible hit box for easy clicking in 3D view
  const hitBox = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 3.2, 1.8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitBox.position.set(0, 1.4, 0);
  group.add(hitBox);

  // Scale cleanly so walking people read vividly at both street level and low city orbit
  group.scale.setScalar(1.35);

  return { group, leftLeg, rightLeg, leftArm, rightArm };
}

/** Position and heading at `dist` metres along a route, wrapping at the end. */
export function sampleRoutePoint(
  v: { route: RouteLine; segLengths: number[]; totalLen: number },
  dist: number,
  outPos: THREE.Vector3,
  outDir: THREE.Vector3
) {
  let d = ((dist % v.totalLen) + v.totalLen) % v.totalLen;
  const pts = v.route.pts;
  for (let i = 0; i < v.segLengths.length; i++) {
    const segLen = v.segLengths[i];
    if (d <= segLen || i === v.segLengths.length - 1) {
      const t = segLen > 0 ? d / segLen : 0;
      const p0 = pts[i];
      const p1 = pts[i + 1];
      outPos.set(
        p0[0] + (p1[0] - p0[0]) * t,
        p0[1] + (p1[1] - p0[1]) * t,
        p0[2] + (p1[2] - p0[2]) * t
      );
      outDir.set(p1[0] - p0[0], 0, p1[2] - p0[2]).normalize();
      return;
    }
    d -= segLen;
  }
}
