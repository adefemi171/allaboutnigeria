import { AERIAL } from "@/lib/map/aerial";
import styles from "./map.module.css";

/** Every source the map draws on, with the credit each asks for. */
const SOURCES: [what: string, credit: string][] = [
  ["Ground height", "Mapzen Terrain Tiles on AWS (SRTM, GMTED2010, ETOPO1)"],
  ["Residents", "WorldPop, University of Southampton (Global2 R2025A, CC BY 4.0), 2026 estimate"],
  ["States", "geoBoundaries / GRID3 Nigeria (CC BY 4.0)"],
  ["Neighbours, lakes and rivers", "Natural Earth"],
  ["Streets and places", "OpenFreeMap © OpenMapTiles Data from OpenStreetMap"],
  [
    "Buildings",
    "© OpenStreetMap contributors, Overture Maps Foundation. Most heights are estimated by this map, not measured",
  ],
  ["Railways", "© OpenStreetMap contributors (ODbL)"],
  ["Aerial", AERIAL.attribution],
  ["Globe", "NASA Blue Marble and Black Marble"],
  ["Search", "Photon by komoot, © OpenStreetMap contributors"],
  ["What watched here", "Sentinel-2 and Landsat via Microsoft Planetary Computer"],
];

export function Sources() {
  return (
    <>
      <p className="mono">Sources</p>
      <dl className={styles.sources}>
        {SOURCES.map(([what, credit]) => (
          <div key={what}>
            <dt>{what}</dt>
            <dd>{credit}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
