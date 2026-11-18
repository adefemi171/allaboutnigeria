import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { MapClient } from "./MapClient";

export const metadata: Metadata = {
  title: "Map of Nigeria in 3D · All About Nigeria",
  description:
    "Nigeria as a 3D model built from open data. From orbit down to your street: real ground heights, a block for every square where people live, and every street and building once you zoom in, with people, okadas, cars and trains on the move.",
};

export default function MapPage() {
  return (
    <>
      <Navbar scene />
      <MapClient />
    </>
  );
}
