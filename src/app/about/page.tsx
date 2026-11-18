"use client";

import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { openFeedbackModal } from "@/components/FeedbackWidget";
import { NIGERIA_STATES } from "@/data/nigeria-states";
import { NIGERIA_PLACES } from "@/data/nigeria-places";
import { SURVIVAL_GUIDES } from "@/data/guides";

const campuses = NIGERIA_PLACES.filter((p) => p.has3DCampus).length;
const universities = NIGERIA_PLACES.filter((p) => p.category === "university").length;
const landmarks = NIGERIA_PLACES.filter((p) => p.category !== "university").length;

const SOURCES = [
  {
    what: "Buildings, roads, water and land use in every state capital and on university campuses",
    source: "OpenStreetMap contributors, fetched via the OSM API and compiled into voxel worlds",
    url: "https://www.openstreetmap.org/copyright",
    licence: "ODbL",
  },
  {
    what: "State capitals, airports, and regional context used in the atlas",
    source: "Compiled state profiles on this site, cross-checked against public Nigerian sources",
    url: "/atlas",
    licence: "Editorial",
  },
  {
    what: "Universities and landmarks shown on the globe and in each state",
    source: "Curated place list on this site (selection, not a complete national register)",
    url: "/places",
    licence: "Editorial",
  },
  {
    what: "Guide facts on NIN, BVN, banking, leases, power and travel",
    source: "Official pages linked at the end of each guide (NIMC, NIBSS, CAC, DisCos, airlines, NRC, and others)",
    url: "/guides",
    licence: "As stated by each source",
  },
  {
    what: "Sun position and day/night lighting on the maps",
    source: "Computed from the device clock for Africa/Lagos (WAT), using a NOAA-style solar model",
    url: "/about#map",
    licence: "Public domain algorithm",
  },
  {
    what: "Satellite passes, their pictures, and the globe on the Sky page",
    source: "Orbits: Celestrak GP element sets, propagated with SGP4 (satellite.js). Pictures: Sentinel-2 and Landsat scenes from Microsoft Planetary Computer; daily mosaics, clouds and the globe from NASA GIBS (VIIRS, MODIS, Blue Marble, Black Marble). Street search: Photon, on OpenStreetMap data",
    url: "/sky",
    licence: "Celestrak redistribution terms; Copernicus, USGS and NASA open data; ODbL",
  },
  {
    what: "Land outlines on the globe",
    source: "Simplified continent and Nigeria outlines drawn for illustration",
    url: "/about#map",
    licence: "Illustration",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0b1620]">
      <Navbar />
      <main id="main" className="about wrap">
        <header className="about__intro">
          <p className="mono">About</p>
          <h1>What this site is, and how far to trust it</h1>
        </header>

        <div className="about__body">
          <section>
            <h2>What it is</h2>
            <p>
              All About Nigeria explains living and moving across Nigeria in
              plain language: choosing a city, finding a place to live, NIN and
              BVN, banking, power and internet, getting around, and healthcare.
              The{" "}
              <Link href="/guides">guides</Link> are in the order you need them.
            </p>
            <p>
              It also has interactive 3D voxel maps for all 36 state capitals
              and Abuja FCT, plus {campuses} university campuses,
              built from real OpenStreetMap geometry. The site is made by
              Runeward Labs. It is independent: it is not connected to the
              Nigerian government or to any of the organisations the guides are
              about. To get in touch, see the{" "}
              <Link href="/contact">contact page</Link>.
            </p>
          </section>

          <section id="guides">
            <h2>How the guides are made</h2>
            <p>
              Each fact in the guides was looked up
              on an official or primary page—such as NIMC, NIBSS, CAC, a DisCo,
              an airline, the NRC, or a hospital—and each guide ends with what
              it is based on.
            </p>
            <p>
              There are {SURVIVAL_GUIDES.length} survival guides on the site so
              far. Rules and prices in Nigeria shift often. Before you act on
              something, open the official page and check that it still says the
              same thing.
            </p>
            <p>
              This is general information, not legal, immigration, or financial
              advice. Rent bands, visa fees, and grid schedules change. Treat
              every number as a starting point, not a guarantee.
            </p>
          </section>

          <section id="report">
            <h2>If something is wrong</h2>
            <p>
              A fact that is wrong, a rule that has changed, a dead link, a
              building in the wrong place, a missing university: please say so.
              There is a report button on every page, and the report records
              which page you were on.
            </p>
            <p>
              <button
                className="button"
                type="button"
                onClick={() => openFeedbackModal({ topic: "About page" })}
              >
                Report a problem
              </button>
            </p>
            <p>
              A report holds what you write, the address of the page, and your
              email if you choose to give one. You can also browse earlier
              community notes on the{" "}
              <Link href="/feedback">feedback log</Link>, or write directly to{" "}
              <a href="mailto:adefemi@runeward.io">adefemi@runeward.io</a>.
            </p>
          </section>

          <section id="map">
            <h2>How to read the map</h2>
            <p>
              From afar, the home page flies from a globe into Nigeria as
              capital beacons—taller blocks where more people live. Open the{" "}
              <Link href="/atlas">atlas</Link> or any{" "}
              <Link href="/explore/abuja">3D city</Link> to walk streets built
              from OpenStreetMap.
            </p>
            <dl className="legend">
              <div>
                <dt>The capitals</dt>
                <dd>
                  Every state capital and Abuja has a 3D voxel city compiled
                  from OSM buildings, roads and waterways. Colours follow each
                  city’s accent; they are a key, not a photograph.
                </dd>
              </div>
              <div>
                <dt>The campuses</dt>
                <dd>
                  {campuses} flagship universities have dedicated campus
                  models. Universities without a full campus model still appear
                  as places you can jump to inside their state’s map.
                </dd>
              </div>
              <div>
                <dt>The places</dt>
                <dd>
                  The globe and state drawers mark {universities} universities
                  and {landmarks} landmarks. That list was put together by hand.
                  It is a selection, not a complete national register.
                </dd>
              </div>
              <div>
                <dt>The streets</dt>
                <dd>
                  In a city you can fly, walk at eye level, ride transit routes
                  where they exist in the data, or follow pedestrians along
                  sidewalks. The walking figures are made up; no data says who
                  is where.
                </dd>
              </div>
              <div>
                <dt>The light</dt>
                <dd>
                  The sun stands where it stands over Nigeria at the time shown
                  on your device (Africa/Lagos, WAT). You can scrub the time
                  slider on a 3D map, or tap Live · WAT to follow the clock
                  again.
                </dd>
              </div>
              <div>
                <dt>The zones</dt>
                <dd>
                  On the home page, the “six zones” scene lights Nigeria’s
                  geopolitical regions as you scroll. It is a way to see
                  regional difference, not a flood or hazard model.
                </dd>
              </div>
              <div>
                <dt>The sky</dt>
                <dd>
                  On <Link href="/sky">Sky</Link> you can pick a city, a
                  street or a spot on the globe, see which satellites passed
                  over it in the last 7 days and which will in the next 2,
                  replay any pass, and look at the pictures that were made
                  public. A pass means the place was in the satellite&apos;s
                  field of view, not that it took a picture.
                </dd>
              </div>
            </dl>
            <p>
              OSM is volunteer-mapped. Dense areas such as Lagos Island or
              Abuja CBD are richer than smaller towns. If a street or building
              is missing or wrong, report it here and, when you can, also edit{" "}
              <a href="https://www.openstreetmap.org" rel="noopener noreferrer">
                OpenStreetMap
              </a>{" "}
              itself.
            </p>
          </section>

          <section id="data">
            <h2>Where the data comes from</h2>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>What</th>
                    <th>Source</th>
                    <th>Licence</th>
                  </tr>
                </thead>
                <tbody>
                  {SOURCES.map((row) => (
                    <tr key={row.what}>
                      <td>{row.what}</td>
                      <td>
                        <a href={row.url} rel="noopener noreferrer">
                          {row.source}
                        </a>
                      </td>
                      <td>{row.licence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="about__by">
              Made by Runeward Labs ·{" "}
              <a href="mailto:adefemi@runeward.io">adefemi@runeward.io</a>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
