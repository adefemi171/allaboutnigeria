"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  StoryStage,
  type StoryFrame,
  type StoryPose,
} from "@/components/home/StoryStage";
import { Footer } from "@/components/Footer";
import { SURVIVAL_GUIDES } from "@/data/guides";
import { NIGERIA_STATES } from "@/data/nigeria-states";
import { NIGERIA_PLACES } from "@/data/nigeria-places";
import { formatSunLine, nigeriaClockParts } from "@/lib/sun";

const SCENES = [
  { id: "globe", label: "Globe" },
  { id: "country", label: "Country" },
  { id: "zones", label: "Zones" },
  { id: "nin", label: "NIN desk" },
] as const;

type SceneId = (typeof SCENES)[number]["id"];

type SceneCam = {
  wide: StoryPose;
  narrow: StoryPose;
};

const [ax, az] = (() => {
  const abuja = NIGERIA_STATES.find((s) => s.slug === "abuja")!;
  return [(abuja.lon - 8) * 4.2, (9 - abuja.lat) * 4.2] as const;
})();

const SCENE_CAM: Record<SceneId, SceneCam> = {
  globe: {
    wide: { x: 0, z: 0, dist: 58, az: 18, tilt: 8, shiftX: 0.22, shiftY: 0.02 },
    narrow: { x: 0, z: 0, dist: 72, az: 18, tilt: 10, shiftX: 0, shiftY: -0.22 },
  },
  country: {
    wide: { x: -2, z: 2, dist: 48, az: -12, tilt: 52, shiftX: 0.18, shiftY: 0.02 },
    narrow: { x: -2, z: 4, dist: 68, az: -8, tilt: 48, shiftX: 0, shiftY: -0.2 },
  },
  zones: {
    wide: { x: -6, z: 4, dist: 34, az: 70, tilt: 56, shiftX: 0.14, shiftY: 0.04 },
    narrow: { x: -4, z: 4, dist: 48, az: 70, tilt: 52, shiftX: 0, shiftY: -0.18 },
  },
  nin: {
    wide: { x: ax, z: az, dist: 6.5, az: -28, tilt: 58, shiftX: 0.16, shiftY: 0.03 },
    narrow: { x: ax, z: az, dist: 9.5, az: -28, tilt: 54, shiftX: 0, shiftY: -0.2 },
  },
};

const clamp = (value: number, low = 0, high = 1) =>
  Math.min(high, Math.max(low, value));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function mixPose(a: StoryPose, b: StoryPose, t: number): StoryPose {
  const turn = ((((b.az - a.az) % 360) + 540) % 360) - 180;
  const dist = Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), t));
  const deep = Math.abs(Math.log(a.dist / b.dist)) > 0.7;
  const k =
    deep && Math.abs(b.dist - a.dist) > 1e-6
      ? (dist - a.dist) / (b.dist - a.dist)
      : t;
  return {
    x: lerp(a.x, b.x, k),
    z: lerp(a.z, b.z, k),
    dist,
    az: a.az + turn * t,
    tilt: lerp(a.tilt, b.tilt, t),
    shiftX: lerp(a.shiftX, b.shiftX, t),
    shiftY: lerp(a.shiftY, b.shiftY, t),
  };
}

function formatWat(date: Date) {
  return date.toLocaleTimeString("en-GB", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const GUIDE_STAGES = [
  {
    id: "arrive",
    label: "Arrive and settle",
    hint: "First weeks",
    slugs: ["moving-to-lagos", "nin-bvn-immigration"],
  },
  {
    id: "live",
    label: "A place to live",
    hint: "Housing",
    slugs: ["renting-an-apartment"],
  },
  {
    id: "money",
    label: "Money and work",
    hint: "Banking & jobs",
    slugs: ["banking-and-fintech", "starting-a-business"],
  },
  {
    id: "daily",
    label: "Daily life",
    hint: "Power, transit, health",
    slugs: ["power-solar-internet", "getting-around-lagos", "healthcare-and-safety"],
  },
] as const;

export function HomeClient() {
  const storyRef = useRef<HTMLElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const [frame, setFrame] = useState<StoryFrame>({
    index: 0,
    hold: 0,
    travel: 0,
    past: false,
    sceneId: "globe",
    progress: 0,
    zoneFill: 0,
  });
  const [pose, setPose] = useState<StoryPose>(SCENE_CAM.globe.wide);
  const [clock, setClock] = useState("");
  const [heroClock, setHeroClock] = useState("");
  const [currentTick, setCurrentTick] = useState<SceneId>("globe");
  const [isPast, setIsPast] = useState(false);
  const [headerSolid, setHeaderSolid] = useState(false);
  const [zonePct, setZonePct] = useState(0);

  const campuses = useMemo(
    () => NIGERIA_PLACES.filter((p) => p.has3DCampus).length,
    []
  );
  const uniCount = useMemo(
    () => NIGERIA_PLACES.filter((p) => p.category === "university").length,
    []
  );

  useEffect(() => {
    const narrowQuery = window.matchMedia("(max-width: 820px)");

    const poseOf = (index: number) => {
      const id = SCENES[index].id;
      return narrowQuery.matches ? SCENE_CAM[id].narrow : SCENE_CAM[id].wide;
    };

    const measure = (): StoryFrame => {
      const y = window.scrollY;
      const screen = window.innerHeight;
      const after = afterRef.current;
      const past = after ? after.getBoundingClientRect().top <= 0 : false;
      const sections = sectionRefs.current.filter(Boolean) as HTMLElement[];

      for (let index = 0; index < sections.length; index++) {
        const top = sections[index].offsetTop;
        const height = sections[index].offsetHeight;
        const last = index === sections.length - 1;
        if (y < top + height || last) {
          const pinned = Math.max(0, height - screen);
          const hold = pinned > 0 ? clamp((y - top) / pinned) : y >= top ? 1 : 0;
          const travel = last ? 0 : clamp((y - top - pinned) / screen);
          const sceneId = SCENES[index].id;
          let zoneFill = 0;
          if (sceneId === "zones") {
            zoneFill =
              travel > 0
                ? lerp(1, 0, smooth(0, 0.7, travel))
                : lerp(0, 1, smooth(0.06, 0.86, hold));
          }
          const progress = index + (travel > 0 ? smooth(0.04, 0.96, travel) : 0);
          return {
            index,
            hold,
            travel,
            past,
            sceneId,
            progress,
            zoneFill,
          };
        }
      }
      return {
        index: 0,
        hold: 0,
        travel: 0,
        past,
        sceneId: "globe",
        progress: 0,
        zoneFill: 0,
      };
    };

    const poseAt = (f: StoryFrame): StoryPose => {
      const here = poseOf(f.index);
      if (f.travel <= 0 || f.index >= SCENES.length - 1) return here;
      return mixPose(here, poseOf(f.index + 1), smooth(0.04, 0.96, f.travel));
    };

    let queued = false;
    const render = () => {
      const f = measure();
      const current =
        f.travel > 0.5 ? Math.min(f.index + 1, SCENES.length - 1) : f.index;
      setCurrentTick(SCENES[current].id);
      setIsPast(f.past);
      setFrame(f);
      setPose(poseAt(f));
      setZonePct(Math.round(f.zoneFill * 100));

      const after = afterRef.current;
      const header = document.querySelector<HTMLElement>("[data-site-header]");
      if (after && header) {
        const under = after.getBoundingClientRect().top <= header.offsetHeight;
        setHeaderSolid(under);
        header.classList.toggle("is-solid", under);
      }

      storyRef.current?.classList.toggle("is-past", f.past);
      document.body.classList.toggle("theme-scene-past", f.past);
    };

    const queue = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        render();
      });
    };

    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    narrowQuery.addEventListener("change", queue);
    render();
    return () => {
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      narrowQuery.removeEventListener("change", queue);
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const { label } = nigeriaClockParts(now);
      setHeroClock(label);
      setClock(`Abuja ${formatWat(now)} · ${formatSunLine(now)}`);
    };
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    document.body.classList.add("theme-scene");
    return () => {
      document.body.classList.remove("theme-scene", "theme-scene-past");
    };
  }, []);

  // Notify navbar about solid header
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("story-header-solid", { detail: { solid: headerSolid } })
    );
  }, [headerSolid]);

  return (
    <main id="main" className="story" ref={storyRef}>
      <StoryStage frame={frame} pose={pose} active={!isPast} />
      <div className="story__shade" aria-hidden="true" />

      <section
        className="scene scene--hero"
        id="globe"
        data-scene="globe"
        ref={(el) => {
          sectionRefs.current[0] = el;
        }}
      >
        <div className="scene__pin">
          <div className="scene__text">
            <p className="mono">
              9.08°N 8.68°E
              <span>{heroClock ? ` · Abuja ${heroClock}` : ""}</span>
            </p>
            <h1>The Nigeria survival guide</h1>
            <p className="scene__lede">
              Plain-language guides for people moving across Nigeria: a place
              to live, NIN and BVN, a bank account, power and internet. Each
              guide lists the official pages its facts come from.
            </p>
            <p className="scene__actions">
              <Link className="button" href="/guides/moving-to-lagos">
                Start with the checklist
              </Link>
              <Link className="button button--quiet" href="/guides">
                All guides
              </Link>
            </p>
          </div>
          <p className="scene__cue mono" aria-hidden="true">
            <svg width="12" height="16" viewBox="0 0 12 16">
              <path
                d="M6 1v13M1.5 9.5 6 14l4.5-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Scroll to fly in
          </p>
        </div>
      </section>

      <section
        className="scene scene--hold"
        id="country"
        data-scene="country"
        ref={(el) => {
          sectionRefs.current[1] = el;
        }}
      >
        <div className="scene__pin">
          <div className="scene__text">
            <p className="mono">The country</p>
            <h2>36 states and the FCT, one block at a time</h2>
            <p>
              This is Nigeria as capital beacons. Taller blocks sit where more
              people live. Every state capital and Abuja has a real OpenStreetMap
              3D voxel city you can walk.
            </p>
            <p>
              <Link href="/atlas">Open the atlas</Link> to fly to any capital
              yourself.
            </p>
          </div>
        </div>
      </section>

      <section
        className="scene scene--long"
        id="zones"
        data-scene="zones"
        ref={(el) => {
          sectionRefs.current[2] = el;
        }}
      >
        <div className="scene__pin">
          <div className="scene__text">
            <p className="mono">Six zones</p>
            <h2>One federation, six ways of living</h2>
            <p>
              Keep scrolling to light the geopolitical zones—from the Lagos–Ibadan
              corridor and the Niger Delta to Kano’s markets and the Jos plateau.
              Housing, power bands, and transit change with each one.
            </p>
            <div className="level">
              <div
                className="level__gauge"
                style={{ ["--fill" as string]: `${zonePct}%` }}
                aria-hidden="true"
              >
                <div className="level__staff" />
                <div className="level__water" />
              </div>
              <p className="level__readout">
                <span className="level__value">
                  {zonePct < 8 ? "Zones" : `${zonePct}% lit`}
                </span>
                <span className="level__share">
                  <b>{NIGERIA_STATES.length}</b> capitals · <b>{campuses}</b> 3D
                  campuses · <b>{uniCount}</b> universities mapped
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        className="scene scene--hold"
        id="nin"
        data-scene="nin"
        ref={(el) => {
          sectionRefs.current[3] = el;
        }}
      >
        <div className="scene__pin">
          <div className="scene__text">
            <p className="mono">Where a move starts</p>
            <h2>Your first desk is NIN and BVN</h2>
            <p>
              Almost everything else waits for two numbers: NIN for identity and
              BVN for banking. Employers, landlords, and SIM registration ask for
              them. Start there, then pick a city and walk its streets in 3D.
            </p>
            <p className="scene__actions">
              <Link className="button" href="/guides/nin-bvn-immigration">
                NIN, BVN &amp; visas
              </Link>
              <Link className="button button--quiet" href="/explore/abuja">
                Open Abuja 3D
              </Link>
            </p>
          </div>
        </div>
      </section>

      <nav className="ticks" aria-label="Parts of the introduction">
        {SCENES.map((scene) => (
          <a
            key={scene.id}
            href={`#${scene.id}`}
            data-tick={scene.id}
            aria-current={currentTick === scene.id ? "step" : undefined}
          >
            <span>{scene.label}</span>
          </a>
        ))}
      </nav>

      <nav
        className="ticks-mobile"
        aria-label="Parts of the introduction"
        hidden={isPast}
      >
        {SCENES.map((scene) => (
          <a
            key={scene.id}
            href={`#${scene.id}`}
            aria-label={scene.label}
            aria-current={currentTick === scene.id ? "step" : undefined}
          />
        ))}
      </nav>

      <p className="hud story__clock" hidden={isPast}>
        {clock}
      </p>
      <p className="hud story__credit">
        Capitals OSM · {campuses} campuses ·{" "}
        <Link href="/contact">Runeward Labs</Link>
      </p>

      <p className="scene__scroll-hint mono" aria-hidden="true" hidden={isPast || currentTick !== "globe"}>
        Scroll to fly in
      </p>

      <div className="after" data-after ref={afterRef}>
        <section className="wrap steps" aria-labelledby="steps-title">
          <div className="steps__intro">
            <p className="mono">The guides</p>
            <h2 id="steps-title">A move, in the order it happens</h2>
            <p>
              Start at the top and work down. Each guide says what to do, what
              to bring, what it costs and how long it takes, and lists the
              official pages its facts come from.
            </p>
            <p className="steps__note">
              Facts are checked against official sources, but Nigeria’s rules
              shift. Spot something wrong?{" "}
              <Link href="/feedback">Send a correction</Link>.
            </p>
          </div>

          <div className="route">
            {GUIDE_STAGES.map((stage) => {
              const guides = stage.slugs
                .map((slug) => SURVIVAL_GUIDES.find((g) => g.slug === slug))
                .filter(Boolean);
              return (
                <section
                  key={stage.id}
                  className="route__stretch"
                  aria-labelledby={`stage-${stage.id}`}
                >
                  <header className="route__stage">
                    <h3 id={`stage-${stage.id}`}>{stage.label}</h3>
                    <p className="mono">{stage.hint}</p>
                  </header>
                  <ol className="route__stops">
                    {guides.map((guide, i) =>
                      guide ? (
                        <li key={guide.slug}>
                          <Link className="stop" href={`/guides/${guide.slug}`}>
                            <span className="stop__number mono" aria-hidden="true">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span className="stop__title">{guide.shortTitle}</span>
                            <span className="stop__summary">{guide.summary}</span>
                          </Link>
                        </li>
                      ) : null
                    )}
                  </ol>
                </section>
              );
            })}
          </div>
        </section>

        <section className="wrap invite">
          <div>
            <p className="mono">The map</p>
            <h2>Look around before you choose where to live</h2>
            <p>
              Fly to any of the 36 state capitals and Abuja, open a university
              campus in 3D, or walk the sidewalks with people on the street.
            </p>
            <p className="scene__actions">
              <Link className="button" href="/atlas">
                Open the atlas
              </Link>
              <Link className="button button--quiet" href="/places">
                Universities &amp; landmarks
              </Link>
            </p>
          </div>
          <dl className="invite__facts">
            <div>
              <dt className="mono">Capitals in 3D</dt>
              <dd>37</dd>
            </div>
            <div>
              <dt className="mono">University campuses</dt>
              <dd>{campuses}</dd>
            </div>
            <div>
              <dt className="mono">Places mapped</dt>
              <dd>{NIGERIA_PLACES.length}</dd>
            </div>
            <div>
              <dt className="mono">Guides</dt>
              <dd>{SURVIVAL_GUIDES.length}</dd>
            </div>
          </dl>
        </section>

        <Footer />
      </div>
    </main>
  );
}
