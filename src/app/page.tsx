import { Navbar } from "@/components/Navbar";
import { HomeClient } from "@/components/home/HomeClient";

export default function HomePage() {
  return (
    <div className="theme-scene-root">
      <Navbar scene />
      <HomeClient />
    </div>
  );
}
