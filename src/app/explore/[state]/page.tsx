import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { CityVoxelScene } from "@/components/voxel/CityVoxelScene";
import { NIGERIA_STATES, getStateBySlug } from "@/data/nigeria-states";
import { NIGERIA_PLACES, getPlaceByCampusSlug } from "@/data/nigeria-places";

export function generateStaticParams() {
  const stateParams = NIGERIA_STATES.map((s) => ({ state: s.slug }));
  const campusParams = NIGERIA_PLACES.filter((p) => p.has3DCampus && p.campusSlug).map((p) => ({
    state: p.campusSlug!,
  }));
  return [...stateParams, ...campusParams];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  const { state } = await params;
  const campus = getPlaceByCampusSlug(state);
  if (campus) {
    return {
      title: `${campus.name} 3D Campus Voxel Map — All About Nigeria`,
      description: `Walk and explore ${campus.name} (${campus.city}, ${campus.state}) in interactive 3D OpenStreetMap voxels.`,
    };
  }
  const profile = getStateBySlug(state);
  if (!profile) return { title: "Explore Nigeria 3D — All About Nigeria" };
  return {
    title: `${profile.capital} (${profile.state}) 3D Voxel Map — All About Nigeria`,
    description: `Explore ${profile.capital}, ${profile.state} in interactive 3D voxels built from real OpenStreetMap geometry, universities, landmarks, street view & walking pedestrians.`,
  };
}

export default async function ExploreStatePage({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  const { state } = await params;
  const campus = getPlaceByCampusSlug(state);
  if (campus) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-[#09090b]">
        <Navbar transparent />
        <div className="min-h-0 flex-1">
          <CityVoxelScene stateSlug={campus.stateSlug} campusSlug={campus.campusSlug} />
        </div>
      </div>
    );
  }

  const profile = getStateBySlug(state);
  if (!profile) notFound();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#09090b]">
      <Navbar transparent />
      <div className="min-h-0 flex-1">
        <CityVoxelScene stateSlug={profile.slug} />
      </div>
    </div>
  );
}
