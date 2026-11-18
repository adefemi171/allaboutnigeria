import { redirect } from "next/navigation";

/**
 * Passes used to have a page of their own, at /sky/pass?norad=..&t=..&slug=kano or
 * ..&lat=..&lon=..&place=Allen Avenue. They are on /sky now: old links land on their place.
 */
export default async function SkyPassPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (name: string) => [params[name]].flat()[0];
  const query = new URLSearchParams();
  const lat = one("lat");
  const lon = one("lon");
  if (lat && lon) {
    query.set("lat", lat);
    query.set("lon", lon);
    const name = one("place");
    if (name) query.set("name", name);
  } else if (one("slug")) {
    query.set("place", one("slug")!);
  }
  redirect(query.size ? `/sky?${query}` : "/sky");
}
