// The shapes that stand in and move through the streets: a walker, a
// motorbike with its rider, a car, a train and a lamp post. Each is a handful of boxes and
// wheels, in metres, standing on the origin and facing +z. movers.ts and
// lamps.ts draw many of each at once.

import * as THREE from "three";

type Corner = [number, number, number];

/** What a part is made of. The shader in movers.ts picks the colour. */
export const MATERIAL = {
  legs: 0,
  /** The one colour that differs per figure: a coat, or the paint of a car. */
  coat: 1,
  skin: 2,
  hair: 3,
  /** Tyres, bike frames, the underside of a train. */
  dark: 4,
  glass: 5,
  /** Lit after dark. */
  headlight: 6,
  taillight: 7,
  /** Lamp posts, which have a shader of their own (lamps.ts). */
  steel: 8,
  lantern: 9,
} as const;

/**
 * How a part moves: the height of its hinge in metres, how far it swings
 * about it (0 for parts that do not), and its material.
 */
type Part = [hinge: number, swing: number, material: number];

class Shape {
  private positions: number[] = [];
  private normals: number[] = [];
  private parts: number[] = [];
  private indices: number[] = [];

  private vertex(position: Corner, normal: Corner, part: Part): number {
    this.positions.push(...position);
    this.normals.push(...normal);
    this.parts.push(...part);
    return this.positions.length / 3 - 1;
  }

  box(min: Corner, max: Corner, material: number, hinge = 0, swing = 0): this {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const faces: [Corner, Corner[]][] = [
      [
        [1, 0, 0],
        [
          [x1, y0, z0],
          [x1, y1, z0],
          [x1, y1, z1],
          [x1, y0, z1],
        ],
      ],
      [
        [-1, 0, 0],
        [
          [x0, y0, z1],
          [x0, y1, z1],
          [x0, y1, z0],
          [x0, y0, z0],
        ],
      ],
      [
        [0, 1, 0],
        [
          [x0, y1, z0],
          [x0, y1, z1],
          [x1, y1, z1],
          [x1, y1, z0],
        ],
      ],
      [
        [0, -1, 0],
        [
          [x0, y0, z1],
          [x0, y0, z0],
          [x1, y0, z0],
          [x1, y0, z1],
        ],
      ],
      [
        [0, 0, 1],
        [
          [x1, y0, z1],
          [x1, y1, z1],
          [x0, y1, z1],
          [x0, y0, z1],
        ],
      ],
      [
        [0, 0, -1],
        [
          [x0, y0, z0],
          [x0, y1, z0],
          [x1, y1, z0],
          [x1, y0, z0],
        ],
      ],
    ];
    for (const [normal, corners] of faces) {
      const [a, b, c, d] = corners.map((corner) => this.vertex(corner, normal, [hinge, swing, material]));
      this.indices.push(a, b, c, a, c, d);
    }
    return this;
  }

  /** A wheel on an axle that runs left to right, centred on x, y, z. */
  wheel(x: number, y: number, z: number, radius: number, half: number): this {
    const part: Part = [0, 0, MATERIAL.dark];
    const sides = 10;
    for (const side of [-1, 1]) {
      const hub = this.vertex([x + side * half, y, z], [side, 0, 0], part);
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const rim = this.vertex(
          [x + side * half, y + Math.sin(a) * radius, z + Math.cos(a) * radius],
          [side, 0, 0],
          part,
        );
        if (k) this.indices.push(hub, rim - 1, rim);
      }
    }
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const normal: Corner = [0, Math.sin(a), Math.cos(a)];
      const [py, pz] = [y + normal[1] * radius, z + normal[2] * radius];
      const left = this.vertex([x - half, py, pz], normal, part);
      const right = this.vertex([x + half, py, pz], normal, part);
      if (k) this.indices.push(left - 2, right - 2, right, left - 2, right, left);
    }
    return this;
  }

  /** The same part on both sides of the figure. */
  pair(min: Corner, max: Corner, material: number, hinge = 0, swing = 0): this {
    this.box(min, max, material, hinge, swing);
    return this.box([-max[0], min[1], min[2]], [-min[0], max[1], max[2]], material, hinge, -swing);
  }

  finish(): THREE.InstancedBufferGeometry {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("aPart", new THREE.Float32BufferAttribute(this.parts, 3));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

const M = MATERIAL;

/** Someone on foot, 1.75 m tall. Legs swing from the hip, arms from the shoulder. */
export function walker(): THREE.InstancedBufferGeometry {
  return new Shape()
    .pair([0.02, 0, -0.1], [0.19, 0.84, 0.1], M.legs, 0.84, -1)
    .box([-0.22, 0.82, -0.13], [0.22, 1.44, 0.13], M.coat)
    .pair([0.22, 0.86, -0.07], [0.33, 1.42, 0.07], M.coat, 1.42, 0.8)
    .box([-0.12, 1.46, -0.12], [0.12, 1.7, 0.12], M.skin)
    .box([-0.13, 1.66, -0.13], [0.13, 1.76, 0.1], M.hair)
    .finish();
}

/**
 * An okada: a small motorbike, 2 m long, with its rider and now and then
 * a passenger behind. The legs do not swing; the bike does the moving.
 */
export function okada(): THREE.InstancedBufferGeometry {
  return (
    new Shape()
      .wheel(0, 0.3, 0.68, 0.3, 0.05)
      .wheel(0, 0.3, -0.68, 0.3, 0.05)
      // Engine and frame, tank, seat, front fork and handlebar.
      .box([-0.14, 0.3, -0.45], [0.14, 0.62, 0.38], M.dark)
      .box([-0.17, 0.62, 0.05], [0.17, 0.82, 0.42], M.coat)
      .box([-0.15, 0.7, -0.6], [0.15, 0.8, 0.08], M.dark)
      .box([-0.04, 0.3, 0.55], [0.04, 1.02, 0.63], M.dark)
      .box([-0.36, 0.98, 0.5], [0.36, 1.03, 0.56], M.dark)
      .box([-0.07, 0.86, 0.62], [0.07, 0.98, 0.68], M.headlight)
      .box([-0.07, 0.72, -0.66], [0.07, 0.8, -0.6], M.taillight)
      // The rider, legs forward on the footrests, hands on the bars.
      .pair([0.07, 0.4, -0.2], [0.19, 0.84, 0.25], M.legs)
      .box([-0.2, 0.8, -0.32], [0.2, 1.4, -0.06], M.coat)
      .pair([0.19, 1.08, -0.16], [0.27, 1.2, 0.52], M.coat)
      .box([-0.11, 1.42, -0.3], [0.11, 1.65, -0.08], M.skin)
      .box([-0.13, 1.6, -0.32], [0.13, 1.72, -0.06], M.hair)
      .finish()
  );
}

/** A small saloon car, 4.3 m long. */
export function car(): THREE.InstancedBufferGeometry {
  const shape = new Shape()
    .box([-0.9, 0.25, -2.15], [0.9, 0.85, 2.15], M.coat)
    .box([-0.8, 0.85, -1.3], [0.8, 1.42, 0.7], M.glass)
    .box([-0.82, 1.42, -1.27], [0.82, 1.48, 0.67], M.coat)
    .pair([0.4, 0.55, 2.15], [0.76, 0.72, 2.18], M.headlight)
    .pair([0.4, 0.58, -2.18], [0.76, 0.72, -2.15], M.taillight);
  for (const x of [-0.82, 0.82]) {
    for (const z of [-1.35, 1.35]) shape.wheel(x, 0.32, z, 0.32, 0.1);
  }
  return shape.finish();
}

/** From the nose of one carriage of a train to the nose of the next, metres. */
export const CARRIAGE_PITCH = 26.8;

/**
 * One carriage of a train, 26 m long: bogies, a body with a band of
 * windows between its doors, a roof, and lights at both ends. Several
 * run nose to tail as one train (see movers.ts).
 */
export function train(): THREE.InstancedBufferGeometry {
  const shape = new Shape()
    .box([-1.1, 0.45, -12.6], [1.1, 0.95, 12.6], M.dark)
    .box([-1.42, 0.95, -13], [1.42, 3.5, 13], M.coat)
    .box([-1.15, 3.5, -12.7], [1.15, 3.8, 12.7], M.dark)
    // Windscreens and lights at both ends.
    .box([-1.1, 2.1, 12.9], [1.1, 3.05, 13.06], M.glass)
    .box([-1.1, 2.1, -13.06], [1.1, 3.05, -12.9], M.glass)
    .pair([0.75, 1.25, 13], [1.15, 1.5, 13.07], M.headlight)
    .pair([0.75, 1.25, -13.07], [1.15, 1.5, -13], M.taillight);
  // The windows stand a little proud of the body, or the two would flicker.
  for (const [from, to] of [
    [-11.2, -6.6],
    [-4.4, 4.4],
    [6.6, 11.2],
  ]) {
    shape.pair([1.38, 2.05, from], [1.5, 2.95, to], M.glass);
  }
  for (const z of [-5.5, 5.5]) {
    shape.pair([1.38, 1.05, z - 0.75], [1.49, 3.2, z + 0.75], M.dark);
  }
  for (const z of [-9, 9]) {
    shape.box([-1.25, 0.1, z - 1.6], [1.25, 0.6, z + 1.6], M.dark);
    for (const x of [-0.85, 0.85]) {
      for (const axle of [-1.1, 1.1]) shape.wheel(x, 0.46, z + axle, 0.46, 0.09);
    }
  }
  return shape.finish();
}

/** How far the lantern of a lamp post hangs out over the road, metres. */
export const LAMP_ARM = 1.6;

/** A street lamp, 7 m tall, with its arm reaching towards +z. */
export function lampPost(): THREE.InstancedBufferGeometry {
  return new Shape()
    .box([-0.09, 0, -0.09], [0.09, 7, 0.09], M.steel)
    .box([-0.05, 6.9, 0], [0.05, 7, LAMP_ARM], M.steel)
    .box([-0.2, 6.8, LAMP_ARM - 0.5], [0.2, 6.94, LAMP_ARM + 0.35], M.lantern)
    .finish();
}
