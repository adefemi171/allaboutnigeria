/** Read the site's own data files (TypeScript) from build scripts. */
import fs from "node:fs";
import path from "node:path";

// Evaluate just the array literal of `export const NAME: Type[] = [...]`
export function loadTsArray(file, declaration) {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "data", file), "utf8");
  const start = src.indexOf(declaration);
  const end = src.indexOf("];", start);
  // eslint-disable-next-line no-new-func
  return new Function(`return ${src.slice(start + declaration.length, end + 1)}`)();
}

/** Universities that have their own 3D campus world. */
export function loadCampuses() {
  return loadTsArray("nigeria-places.ts", "export const NIGERIA_PLACES: NigeriaPlace[] = ").filter(
    (p) => p.has3DCampus && p.campusSlug
  );
}
