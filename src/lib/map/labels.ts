// Names on the map. These are ordinary HTML elements laid over the canvas
// and moved every frame, so the type stays crisp at any zoom and the names
// can be clicked.

import * as THREE from "three";
import type { StreetLabelKind } from "./street-tiles";

export type LabelKind =
  "city" | "university" | "state" | "water" | "landmark" | "country" | "pin" | StreetLabelKind;

export interface LabelSpec {
  id: string;
  text: string;
  kind: LabelKind;
  /** Scene position of the anchor point. */
  x: number;
  y: number;
  z: number;
  /** Lower ranks win when two labels would overlap. */
  rank: number;
  /** The label shows while the camera distance is within this range (km). */
  minDistance: number;
  maxDistance: number;
  interactive: boolean;
  /**
   * Direction on the ground the name runs along, radians from east towards
   * south. Street names use it to follow their street.
   */
  angle?: number;
  /**
   * Where there is no room for the name, or the camera is further than
   * this (km), the place still shows as a dot that gives its name when
   * pointed at.
   */
  dotBeyond?: number;
}

/** Names added after the map was built, such as those of one street tile. */
export interface LabelGroup {
  setVisible(visible: boolean): void;
  remove(): void;
}

interface Label {
  spec: LabelSpec;
  element: HTMLElement;
  width: number;
  height: number;
  shown: boolean;
  /** Showing as a dot, without its name. */
  dot: boolean;
  lastX: number;
  lastY: number;
  lastAngle: number;
  group: { visible: boolean } | null;
}

// Where the anchor point is: under the name for places marked with a dot,
// in the middle of it for everything else.
const ANCHORED_BELOW: Record<LabelKind, boolean> = {
  city: true,
  university: true,
  landmark: true,
  country: true,
  pin: true,
  station: true,
  civic: true,
  campus: true,
  area: false,
  state: false,
  water: false,
  street: false,
  canal: false,
  hood: false,
  building: false,
};

/**
 * A long street or a canal is named once in every tile it crosses. On
 * screen, the same name is not repeated within this many pixels.
 */
const REPEAT_AFTER = 380;
/** A university has many buildings. Its sign stands on few of them. */
const REPEAT_CAMPUS_AFTER = 900;

export class Labels {
  private labels: Label[] = [];
  private point = new THREE.Vector3();
  private hidden = new Set<LabelKind>();

  constructor(
    private container: HTMLElement,
    specs: LabelSpec[],
    private onSelect: (id: string) => void,
  ) {
    this.create(specs, null);
    // Sizes change once the web font arrives.
    document.fonts?.ready.then(() => this.measure(this.labels));
  }

  private create(specs: LabelSpec[], group: Label["group"]): Label[] {
    const made: Label[] = [];
    const fragment = document.createDocumentFragment();
    for (const spec of specs) {
      const element = document.createElement(spec.interactive ? "button" : "span");
      element.className = `map-label map-label--${spec.kind} is-hidden`;
      if (spec.dotBeyond === undefined) {
        element.textContent = spec.text;
      } else {
        // The name is its own element, so the dot can stay when it goes.
        const name = document.createElement("span");
        name.className = "map-label__name";
        name.textContent = spec.text;
        element.appendChild(name);
      }
      if (spec.interactive) {
        (element as HTMLButtonElement).type = "button";
        // Reachable through search and by pointer; keeping forty names out
        // of the tab order makes the page usable by keyboard.
        element.tabIndex = -1;
        element.addEventListener("click", () => this.onSelect(spec.id));
      }
      fragment.appendChild(element);
      made.push({
        spec,
        element,
        width: 0,
        height: 0,
        shown: false,
        dot: false,
        lastX: NaN,
        lastY: NaN,
        lastAngle: 0,
        group,
      });
    }
    this.container.appendChild(fragment);
    this.measure(made);
    this.labels.push(...made);
    this.labels.sort((a, b) => a.spec.rank - b.spec.rank);
    return made;
  }

  private measure(labels: Label[]): void {
    for (const label of labels) {
      // A dot has no size. Measure it with its name showing.
      if (label.dot) label.element.classList.remove("is-dot");
      label.width = label.element.offsetWidth;
      label.height = label.element.offsetHeight;
      if (label.dot) label.element.classList.add("is-dot");
    }
  }

  /** Add names that can be taken away again. They start out visible. */
  add(specs: LabelSpec[]): LabelGroup {
    const group = { visible: true };
    const made = new Set(this.create(specs, group));
    return {
      setVisible: (visible) => {
        group.visible = visible;
      },
      remove: () => {
        for (const label of made) label.element.remove();
        this.labels = this.labels.filter((label) => !made.has(label));
        made.clear();
      },
    };
  }

  /** Hide or show every name of some kinds, whatever else is set. */
  setKinds(kinds: LabelKind[], shown: boolean): void {
    for (const kind of kinds) {
      if (shown) this.hidden.delete(kind);
      else this.hidden.add(kind);
    }
  }

  /**
   * @param relief How much of the stretched relief is drawn, 0 to 1. Names
   *   stand on the model, so they come down with it.
   */
  update(camera: THREE.PerspectiveCamera, width: number, height: number, distance: number, relief = 1): void {
    const placed: [number, number, number, number][] = [];
    const repeats = new Map<string, [number, number][]>();
    const pad = 4;

    for (const label of this.labels) {
      const { spec, element } = label;
      let visible =
        (!label.group || label.group.visible) &&
        !this.hidden.has(spec.kind) &&
        distance >= spec.minDistance &&
        distance <= spec.maxDistance;

      let sx = 0;
      let sy = 0;
      let angle = 0;
      if (visible) {
        const y = spec.y * relief;
        this.point.set(spec.x, y, spec.z).project(camera);
        visible =
          this.point.z > -1 &&
          this.point.z < 1 &&
          Math.abs(this.point.x) < 1.05 &&
          Math.abs(this.point.y) < 1.05;
        sx = (this.point.x * 0.5 + 0.5) * width;
        sy = (-this.point.y * 0.5 + 0.5) * height;

        if (visible && spec.angle !== undefined) {
          // Where a point a little further along the street lands on screen
          // gives the slope to write the name at.
          const step = Math.max(0.005, distance * 0.02);
          this.point
            .set(spec.x + Math.cos(spec.angle) * step, y, spec.z + Math.sin(spec.angle) * step)
            .project(camera);
          const ex = (this.point.x * 0.5 + 0.5) * width - sx;
          const ey = (-this.point.y * 0.5 + 0.5) * height - sy;
          angle = Math.atan2(ey, ex);
          // Never upside down.
          if (angle > Math.PI / 2) angle -= Math.PI;
          if (angle <= -Math.PI / 2) angle += Math.PI;
        }
      }

      if (visible && label.group) {
        const others = repeats.get(spec.text);
        const apart = spec.kind === "campus" ? REPEAT_CAMPUS_AFTER : REPEAT_AFTER;
        if (others?.some(([x, y]) => Math.hypot(x - sx, y - sy) < apart)) {
          visible = false;
        }
      }

      let dot = visible && spec.dotBeyond !== undefined && distance > spec.dotBeyond;
      if (visible && !dot) {
        const below = ANCHORED_BELOW[spec.kind];
        // The box around a name written at a slope.
        const c = Math.abs(Math.cos(angle));
        const s = Math.abs(Math.sin(angle));
        const w = label.width * c + label.height * s;
        const h = label.width * s + label.height * c;
        const left = sx - w / 2 - pad;
        const right = sx + w / 2 + pad;
        const top = (below ? sy - h : sy - h / 2) - pad;
        const bottom = (below ? sy : sy + h / 2) + pad;
        let room = true;
        for (const [l, t, r, b] of placed) {
          if (left < r && right > l && top < b && bottom > t) {
            room = false;
            break;
          }
        }
        // No room for the name: a place that can be a dot becomes one.
        if (!room && spec.dotBeyond !== undefined) dot = true;
        else visible = room;
        if (visible && !dot) {
          placed.push([left, top, right, bottom]);
          const others = repeats.get(spec.text);
          if (others) others.push([sx, sy]);
          else repeats.set(spec.text, [[sx, sy]]);
        }
      }

      if (visible) {
        const x = Math.round(sx * 2) / 2;
        const y = Math.round(sy * 2) / 2;
        const turn = Math.round(angle * 200) / 200;
        if (x !== label.lastX || y !== label.lastY || turn !== label.lastAngle) {
          element.style.transform = turn
            ? `translate(${x}px, ${y}px) rotate(${turn}rad)`
            : `translate(${x}px, ${y}px)`;
          label.lastX = x;
          label.lastY = y;
          label.lastAngle = turn;
        }
      }
      if (visible !== label.shown) {
        element.classList.toggle("is-hidden", !visible);
        label.shown = visible;
      }
      if (visible && dot !== label.dot) {
        element.classList.toggle("is-dot", dot);
        label.dot = dot;
      }
    }
  }

  dispose(): void {
    for (const label of this.labels) label.element.remove();
    this.labels = [];
  }
}
