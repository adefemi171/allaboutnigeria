import { Navbar } from "@/components/Navbar";
import { CityVoxelScene } from "@/components/voxel/CityVoxelScene";

export const metadata = {
  title: "Lagos 3D Voxel Map — All About Nigeria",
  description:
    "Explore Central Lagos (Marina, Victoria Island, Ikoyi, Lekki-Ikoyi Link Bridge, Third Mainland Bridge, Eko Atlantic) in interactive 3D voxels built from OpenStreetMap.",
};

export default async function LagosPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#09090b]">
      <Navbar transparent />
      <div className="min-h-0 flex-1">
        <CityVoxelScene stateSlug="lagos" initialView={params.view} />
      </div>
    </div>
  );
}
